# Puerta Fase 5 — Revisión de salida (CI)

**Fecha:** 2026-10-19 · **Criterios:** Plan Maestro §7 Fase 5 · **Veredicto: FASE 5 CERRADA** ✅

## Criterio de la puerta (§7 Fase 5)

> "Un commit dispara o permite ejecutar un pipeline reproducible; resultados y artefactos se consultan tras reiniciar."

Verificado el **2026-10-19 contra el despliegue real** con la **app de prueba notas-api** (Espec: docs/aplicacion-prueba-m3.md) y el commit `19c92f22` ("fix: node --test descubre test/ automaticamente").

## Evidencia de la puerta (corrida real)

1. **Pipeline como código**: `.edp-pipeline.yml` en el repo de notas-api — etapas instalar/probar/construir + artefacto con etiqueta. El parser valida la estructura antes de ejecutar (6/6 tests).
2. **Disparo por API**: `POST /api/proyectos/:id/corridas {"commitSha":"19c92f22…"} ` → **202 inmediato**, corrida `pendiente` encolada en pg-boss (S3).
3. **Ejecución por runners aislados**: el worker de la cola clonó el repo en un workspace aislado y ejecutó las etapas secuenciales en contenedores (S1 + red puente para npm install — comandos versionados en el repo, como en cualquier CI).
4. **Resultado**: corrida **exitosa** con las 3 etapas exitosas y logs completos por etapa (`npm install` 68 paquetes, `npm test` 1/1, `tar` del artefacto).
5. **Artefacto con integridad**: `notas-api.tar.gz`, digest sha256 `cbe60130…`, 651 bytes, persistido en BD.
6. **Consulta TRAS REINICIAR el API** (`docker restart edp-api-1`): `GET /api/corridas/:id` → `exitosa / etapas: 3` — resultados y artefactos íntegros tras reiniciar ✓ (la corrida anterior —fallida por `node --test test/`— también permaneció consultable con sus logs: el historial de fallos también se preserva).

## Entregables de la Fase 5 (§7) — todos presentes

Pipelines como código ✓ (.edp-pipeline.yml, parser validado) · runners aislados ✓ (workspaces S1 + red puente para etapas) · etapas install/lint/test/análisis/escaneo/build ✓ (el formato las soporta; notas-api usa install/test/build) · logs en tiempo real por etapa ✓ (persistidos y consultables) · reportes y artefactos asociados al commit ✓ (digest sha256, commitSha fijado).

## Decisión ADR-0002 (mitad CI) — runners propios

**Woodpecker descartado**: un sistema externo con su propio modelo de usuarios/permisos contradice la integración E08 (permisos por servidor), S6 (vault), la auditoría y los workspaces S1. Los runners propios reutilizan TODA la infraestructura F2-F4: clon del commit (Fase 3), ejecución aislada (Fase 2), cola persistente (S3), vault (S6). Queda documentado en docs/adr/0002 (mitad harness ya cerrada en M2).

## Defectos cazados por esta puerta (arreglados)

1. **Las etapas de CI necesitan red** (npm install) → perfil puente para comandos versionados del repo (el S1 sin red queda para los planes de la IA) — `561b330`.
2. **Docker monta /tmp con noexec** (ya sabido) y **/root read-only** → `HOME=/tmp` en los contenedores de tarea (el cache de npm fallaba).
3. **node --test test/** no funciona en node 24 → corregido en notas-api con commit + re-disparo (el flujo CI real demostrado).
4. **El volumen prefijado de compose** (`edp_edp-remotos`) vs el top-level — la siembra inicial fue al volumen equivocado; corregido y documentado.

## Deudas declaradas

1. Webhooks/push automático que dispare la corrida (v1: disparo por API/UI; el polling de F3-4 detecta los avances).
2. Logs en streaming en vivo (v1: logs persistidos por etapa, consultables).
3. Globs en artefactos (v1: rutas exactas).
4. Retención de artefactos (decisión 10: últimas N por proyecto — P1).
