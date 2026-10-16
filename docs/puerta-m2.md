# Puerta M2 — Revisión de salida de la Fase 2 (Workspace y AI Harness)

**Fecha:** 2026-10-16 · **Criterios:** Plan Maestro §7 Fase 2 · **Veredicto: M2 CERRADA** ✅

## Criterio de la puerta (§7 Fase 2)

> "La IA modifica un proyecto de prueba mostrando exactamente qué cambió con aceptar/descartar, y al simular agotamiento de cuota la tarea continúa con el proveedor de respaldo sin perder trabajo."

Verificado el **2026-10-16 contra el despliegue real** (Docker Compose: edp-postgres + edp-api + edp-web + mock-ai/mock-ai-respaldo) con **LLM real**: NVIDIA NIM, modelo `nvidia/nemotron-3-super-120b-a12b` (API OpenAI-compatible vía `ProveedorOpenAICompatible`), key en `docker/.env` gitignored (CONSTRAINTS §1.2).

## Evidencia 1 — la IA modifica y muestra exactamente qué cambió

1. **Plan generado por el LLM real** (POST `/harness/plan`, instrucción: "Crea saludar.js con una función… y verifica con node"):
   - `proveedor: "nvidia-nim"`, `failover: false`, uso real 141/308 tokens.
   - Plan JSON coherente de 2 pasos: editar `saludar.js` + comando de verificación con `node`.
2. **Aprobar y ejecutar** (POST `/harness/ejecutar`): los pasos corrieron en el workspace aislado (S1) y el endpoint devolvió el **diff exacto**:
   - `diff --git a/saludar.js … +function saludar(nombre) { return `Hola, ${nombre}!`; } …` — byte a byte lo que el LLM propuso.
   - Checkpoint inicial `736421de` → checkpoint final `65d2ec4` ("tarea: Crear y verificar saludar.js").
3. **Aceptar**: el cambio queda commiteado; `estado` del workspace: `head: 65d2ec4, limpio: true`.
4. **Descartar (rewind exacto S4)**: POST `/harness/descartar` al checkpoint inicial → `estado`: `head: 736421de, limpio: true`, **workdir vacío** (`saludar.js` revertido sin rastro).
5. **e2e de navegador (Playwright, `apps/web/e2e/m2.mjs`)**: registro → proyecto → "Abrir workspace" → instrucción → plan mostrado ANTES de ejecutar → aprobar → diff visible → aceptar → persistencia tras recargar. `M2-UI-E2E: PASA`.

## Evidencia 2 — failover S5 sin perder la tarea

- **Unit/e2e (mock tipificado)**: el principal lanza `QuotaError` → el harness reintenta con el respaldo → la tarea se genera completa (spec `harness.service.spec`, e2e `harness.e2e.spec`, 4/4).
- **Demo en vivo (indisponibilidad)**: `docker stop` del proveedor principal → el chat siguió respondiendo vía el respaldo (`fix(harness)` `7661f36`: cuota O indisponibilidad → failover; los 4xx propios abortan).
- **Configuración de la puerta**: principal = NVIDIA NIM real; respaldo = mock-ai-respaldo local (cadena `EDP_AI_*` + `EDP_AI_RESPALDO_*`).

## Evidencia 3 — transversales de la fase

- **Límites de gasto**: libro mayor `gasto_ia` (migración 0002) con registro por llamada (nvidia-nim 141/308 verificado en BD) y límite **acumulado** por proyecto (spec: gasto previo 200 + llamada 150 > 250 → `LimiteGastoError`).
- **Reglas de proyecto**: packs SKILL.md con frontmatter y precedencia, inyectadas en el prompt del sistema (mock registra la solicitud; verificado).
- **Aislamiento S1 como regresión permanente** en la suite (rootfs-ro, sin red, sin caps, pids/mem limitados).
- **Arranque sin key válido**: sin `EDP_AI_API_KEY` la API arranca y los endpoints de IA responden 503 (e2e 4/4).

## Suites al cierre

- Server: **17 archivos, 61/61** · Web: **3 archivos, 9/9** · e2e navegador: **M2-UI-E2E PASA** · typecheck (`tsc`): 0 errores.

## Decisiones cerradas en esta puerta

- **ADR-0002 (decisión 18)**: bucle propio determinista **sin** LangGraph/OpenHands — cierre con evidencia LLM real (ver el ADR).

## Deudas declaradas (no bloquean)

1. `packages/shared` funcional (placeholder documentado; requiere reconfigurar el contexto de build de Docker).
2. Seed de admin en el instalador (Fase 9).
3. Workflow `migration:generate` cuando el esquema evolucione.
4. Docker Desktop 29.8.2 inestable en la máquina de desarrollo (4 caídas; protocolo de recuperación documentado y probado).
