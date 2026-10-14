# Puerta M1 — Revisión de salida de la Fase 1 (Núcleo y UI)

**Fecha:** 2026-10-13 · **Criterios:** Plan Maestro §7 Fase 1 · **Veredicto: M1 CERRADA** ✅

## Criterio de la puerta (§7 Fase 1)

> "Reiniciar los servicios no pierde proyectos ni deja trabajos en estados incoherentes; ningún secreto aparece en la base de datos ni en los logs."

Verificado el **2026-10-13 contra el despliegue real** (Docker Compose: edp-postgres + edp-api + edp-web):

### Criterio 1 — Reinicio del stack ✅

1. BD truncada → registro del primer usuario → **rol admin** (bootstrap).
2. Creación via API: proyecto (`Proyecto Puerta M1`), secreto (`PRE_M1`), trabajo de cola (`mantenimiento`).
3. `docker compose restart` (api + postgres).
4. Tras el reinicio: login OK (usuarios persistidos) · proyecto con **mismo id** · trabajo con **mismo id**, estado `completed` y resultado íntegro.

### Criterio 2 — Secretos fuera de BD y logs ✅

1. **pg_dump real** de la tabla `secretos` (70 líneas) + grep del valor en claro → **0 coincidencias** (regresión del criterio S6/ADR-0005).
2. **Logs del contenedor** tras todo el flujo → grep del valor → **0 coincidencias** (todos los logs pasan por `LoggerSeguro` con el sanitizador; validado además por tests unitarios de redacción).

## Entregables de la Fase 1 (plan §7)

| Entregable | Estado | Evidencia |
|---|---|---|
| Monorepo (apps/server NestJS, apps/web React, packages/shared) | ✅ (shared como placeholder — deuda menor) | estructura del repo |
| API + PostgreSQL | ✅ | endpoints /api/* operativos |
| Autenticación y roles básicos | ✅ | bcrypt + JWT + guards; 401/403 con denegaciones auditadas; suite 33 |
| Proyectos | ✅ | CRUD básico con slug único + auditoría transaccional |
| Cola de trabajos y worker (pg-boss v12) | ✅ | crash/re-entrega probado EN LA APP (test de puerta); espejo `trabajos` |
| Almacén local de secretos (S6) | ✅ | envelope AES-256-GCM; pg_dump=0; rotación; JIT sin endpoint de valores |
| Auditoría | ✅ | append-only; toda mutación con actor (usuario/sistema); denegaciones auditadas |
| Logs estructurados | ✅ | LoggerSeguro JSON con redacción [REDACTADO] |
| Docker Compose de desarrollo | ✅ | postgres 5433 / api 3100 / web 3101, healthchecks, BD de tests separada |
| Esqueleto lanzador `edp.exe` | ✅ | .NET 8 self-contained; up/stop; espera salud; abre la UI |
| **UI básica** | ✅ | React: acceso + proyectos; e2e Playwright+Edge contra el despliegue |

## Suites

- Server: **10 archivos, 33 tests, 0 fallos** — dos corridas consecutivas (aislamiento verificado con BD de tests `edp_test` separada del despliegue).
- Web: **2 archivos, 5 tests, 0 fallos** (jsdom + RTL).
- E2E navegador (Edge): registro → proyectos → crear → persiste tras recargar.

## Deuda menor declarada (no bloquea la puerta)

1. `packages/shared` placeholder — los tipos compartidos (contratos API) se cablean con la primera feature de la Fase 2.
2. Errores de cola (`[cola]`) aún via console.error — enrutar por LoggerSeguro en la Fase 2.
3. Seed del admin en el instalador (el bootstrap "primer usuario = admin" aplica a BD limpia).
4. `migrationsRun` + migración hand-written — el workflow `migration:generate` se adoptará cuando el esquema evolucione (Fase 2).

## Siguiente paso

**Fase 2 — Workspace y AI Harness (M2):** workspaces aislados (batería S1), chat por proyecto, plan antes de ejecutar, checkpoints/rewind, failover de proveedores y carga de packs SKILL.md — con la decisión 18 (ADR-0002, construir vs. integrar) cerrándose con LLM real.
