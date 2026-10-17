# Puerta Fase 3 — Revisión de salida (Git y remotos, completa M2)

**Fecha:** 2026-10-17 · **Criterios:** Plan Maestro §7 Fase 3 · **Veredicto: FASE 3 CERRADA** ✅

## Criterio de la puerta (§7 Fase 3)

> "Un cambio de la IA se revisa, se confirma en un commit y se sincroniza sin perder trabajo del usuario."

Verificado el **2026-10-17 contra GitHub real** (`github.com/jorgeramos2708/edp-test`) con LLM real (NVIDIA NIM, `nvidia/nemotron-3-super-120b-a12b`) y el PAT del usuario desde el vault de la propia plataforma (S6, registrado por el usuario en la UI — jamás transitó por el chat).

## Evidencia de la puerta (corrida real)

1. **Clon real de GitHub**: el workspace nace clonado del origen (`clonado: true`). El repo estaba vacío (sin rama) → reintento automático sin `-b` (el primer push crea la rama).
2. **Plan generado por el LLM real**: "Crea un README.md…" → plan JSON coherente de 1 paso (139/296 tokens, `proveedor: nvidia-nim`).
3. **Revisión del diff**: ejecución determinista en el workspace aislado → diff exacto del README.md propuesto por el LLM.
4. **Commit atómico**: checkpoint inicial `c9bb77c1` → checkpoint final `1ce8a481`.
5. **Sincronización**: `POST …/push` → `* [new branch] HEAD -> main` (GitHub real).
6. **Verificación INDEPENDIENTE**: `git ls-remote https://github.com/jorgeramos2708/edp-test.git` desde fuera de la plataforma → `refs/heads/main = 1ce8a481…` — **idéntico al checkpoint final** de la plataforma.

## Evidencia transversal (sin perder trabajo)

- **Conflicto vía API** (e2e): push rechazado (no-fast-forward) → `pull` informa `conflicto: true` + archivos → el rebase se abortó y el trabajo local quedó intacto (commit local preservado, `status` limpio).
- **Polling**: sondeo de remotos con auditoría (`proyecto.remoto.avance`); un remoto caído no tumba el sondeo.
- **Credenciales por referencia**: el proyecto nombra el secreto del vault (`repoCredencial`, migración 0005); el valor solo viaja en el env del contenedor efímero mediante `credential.helper` inline — jamás en comandos, `.git/config` ni logs (sanitizador activo: el intento con token en la salida fue redactado).

## Entregables de la Fase 3 (§7) — todos presentes

clonar y abrir ✓ · estado ✓ · ramas ✓ · historial ✓ · diff ✓ · commits atómicos ✓ · pull/push ✓ · manejo de conflictos ✓ · adaptador GitHub ✓ · polling ✓ (webhooks P2) · verificación de secretos ✓ (vault + UI) · sincronización de secretos con GitHub (opcional) → P2 con CI (Fase 5).

## Suites al cierre

Server **80/80** (20 archivos) · Web **14/14** · typecheck 0 · detector impeccable 0 hallazgos.

## Defectos cazados por esta puerta (arreglados en `5c3b937`)

1. Docker monta `/tmp` con **noexec** → el script askpass no era ejecutable → **credential helper inline** (función shell, cero archivos).
2. Repos recién creados **sin rama** → clon con reintento sin `-b`.
3. Nest pasa el **objeto Error** al logger → `Object.entries(Error) = {}` perdía el diagnóstico → LoggerSeguro extrae `message`/`stack` (mejora permanente de observabilidad).

## Deudas declaradas

1. Webhooks de GitHub (P2; el polling cubre v1).
2. Sincronización de secretos con GitHub Actions (P2, con CI en Fase 5).
