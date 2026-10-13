# Backlog priorizado con criterios de aceptación — Fase 0 (entregable M0)

**Fuente:** Plan Maestro §9 (épicas y prioridades) · **Alcance de este documento:** desglose accionable con criterios de aceptación **del P0 (imprescindible M3) y P1 (necesario v1.0)**. P2/P3 siguen en el Plan §9 sin duplicar.
**Leyenda:** cada ítem cierra cuando TODOS sus criterios pasan y la puerta de su fase está cubierta. La IA es actor auditado en todo lo que toca.

## E01 Plataforma base (Fase 1 → M1)

| ID | Ítem | P | Criterios de aceptación |
|---|---|---|---|
| E01-1 | Monorepo + API + PostgreSQL + compose de desarrollo | P0 | `docker compose up` levanta API y BD; migraciones idempotentes; `apps/web` compila |
| E01-2 | Autenticación y roles | P0 | login con sesión firmada; endpoints exigen permiso de la [matriz](matriz-permisos.md); test de negación por defecto por endpoint |
| E01-3 | Proyectos (CRUD + clasificación privacidad D14) | P0 | crear/leer/editar/eliminar lógico; clasificación obligatoria al crear (UC-01 precondición) |
| E01-4 | Cola pg-boss + workers | P0 | encolar→ejecutar→completar; estados espejo coherentes; **reinicio de servicios no deja trabajos incoherentes** (puerta M1; S3 ✓) |
| E01-5 | Almacén de secretos (envelope S6) | P0 | crear/rotar; API no devuelve valores a la capa IA; **pg_dump + grep = 0**; redacción en logs verificada con test |
| E01-6 | Auditoría + logs estructurados | P0 | toda mutación escribe `auditoria` en la misma transacción; logs sin secretos; retención configurable (D10) |
| E01-7 | Búsqueda y ajustes globales | P1 | búsqueda de proyectos/entornos; ajustes persistidos |

## E02 Identidad y permisos (Fase 1-2 → M1-M2)

| ID | Ítem | P | Criterios |
|---|---|---|---|
| E02-1 | Matriz de permisos en código + coerción | P0 | cada endpoint declara permiso; IDOR cross-proyecto bloqueado con test (T1.3) |
| E02-2 | Permisos por entorno/servidor | P1 | restricción por proyecto-servidor-acción según matriz |

## E03 Secretos (Fase 1 → M1)

| ID | Ítem | P | Criterios |
|---|---|---|---|
| E03-1 | Vault con envelope + clave maestra externa | P0 | S6 como base; rotación de DEKs posible sin re-cifrar todo (claves por proyecto) |
| E03-2 | Rotación y expiración | P1 | rotación de maestra y DEKs documentada y probada; expiración marca uso bloqueado |

## E04 Trabajos (Fase 1 → M1)

| ID | Ítem | P | Criterios |
|---|---|---|---|
| E04-1 | Encolado, reintentos, cancelación | P0 | reintentos con backoff; cancelación → `cancelled` con auditoría (S3 ✓) |
| E04-2 | Prioridades y concurrencia | P1 | colas por prioridad; límite de workers configurado |

## E05 AI Harness (Fase 2 → M2)

| ID | Ítem | P | Criterios |
|---|---|---|---|
| E05-1 | Chat por proyecto + plan antes de ejecutar | P0 | plan visible antes de tocar nada (UC-01); plan persistido en `ejecuciones_ia` |
| E05-2 | Permisos por herramienta + hooks de política | P0 | herramienta denegada si el nivel de autonomía no la cubre; hook puede bloquear/editar acciones; ambos auditados |
| E05-3 | Editor, explorador y diff por paso | P0 | diff por checkpoint (S4) visible; aceptar/descartar con **rewind exacto** (hash, ADR-0008) |
| E05-4 | Bucle editar→lint→prueba→corregir | P0 | plan TDD rojo-verde completo en repo de prueba (S4 ✓) con checkpoints `--allow-empty` |
| E05-5 | Failover de proveedores + límites de gasto | P0 | `QuotaError` → resumen → proveedor B sin duplicar (S5 ✓); gasto acumulado por proyecto con corte y alerta (D11) |
| E05-6 | Workspaces aislados (S1 flags) | P0 | todo workspace de tarea usa el set completo de flags; batería S1 en regresión |
| E05-7 | Reglas de proyecto + packs SKILL.md con precedencia | P1 | loader SKILL.md (S4 ✓); conflicto de intenciones resuelto por prioridad declarada; reglas por proyecto versionadas |
| E05-8 | Modo local estricto | P1 | proyecto `local` (D14) no envía nada a proveedores: test de red del workspace |

## E06 Workspaces (Fase 2 → M2)

| ID | Ítem | P | Criterios |
|---|---|---|---|
| E06-1 | Contenedor por tarea con flags S1 | P0 | mismo set de flags del spike; usuario no-root; `--network none` por defecto |
| E06-2 | Worktrees paralelos | P1 | dos tareas concurrentes sin interferencia (lock por workspace) |

## E07 Git (Fase 3 → M2)

| ID | Ítem | P | Criterios |
|---|---|---|---|
| E07-1 | Clonar/abrir, estado, ramas, historial, diff | P0 | operaciones vía git CLI; diffs consistentes con S4 (`autocrlf=false` en workspaces) |
| E07-2 | Commits atómicos + pull/push | P0 | push solo por humano (matriz); conflicto manejado sin perder trabajo (puerta Fase 3) |
| E07-3 | Adaptador GitHub (webhooks o polling) | P1 | sincronización bidireccional opcional; credenciales por referencia |

## E08 Servidores y terminales (Fase 4 → M3)

| ID | Ítem | P | Criterios |
|---|---|---|---|
| E08-1 | Catálogo de servidores + credencial por referencia | P0 | alta/baja; credenciales solo cifradas (modelo-datos §4) |
| E08-2 | Terminal SSH web (xterm.js + PTY) | P0 | sesión interactiva en tiempo real, cierre limpio y reconexión controlada (S2); solo servidores autorizados por matriz |
| E08-3 | SFTP | P0 | transferencia en directorio autorizado; registro auditado |
| E08-4 | Auditoría de sesiones | **P0** | comandos y sesiones registrados (compromiso 5; elevado en v1.1 §18.2) |
| E08-5 | Estado y diagnóstico del servidor | P1 | ping/uptime/disco desde la plataforma |

## E09 CI (Fase 5 → M3)

| ID | Ítem | P | Criterios |
|---|---|---|---|
| E09-1 | Pipelines como código + etapas | P0 | pipeline declarado en repo; install/lint/test/secretos/build; runner aislado con flags S1 |
| E09-2 | Logs en tiempo real + reportes | P0 | streaming de logs por corrida; resultados consultables tras reinicio (puerta Fase 5) |
| E09-3 | Artefactos con digest asociados al commit | P0 | artefacto etiquetado por revisión; digest verificable (T7.4) |
| E09-4 | Escaneo de secretos y dependencias (gitleaks/trivy) | P1 | motores CLI orquestados; corrida falla con hallazgos críticos (CONSTRAINTS §1.2) |

## E10 CD (Fase 6 → M3)

| ID | Ítem | P | Criterios |
|---|---|---|---|
| E10-1 | Entornos + secretos por entorno | P0 | desarrollo/pre/producción; variables por referencia |
| E10-2 | Despliegue recreate + health + versión | P0 | **exitoso solo con versión==esperada y health verde** (T7.1); concurrentes bloqueados |
| E10-3 | Aprobación de producción (humano siempre) | P0 | `aprobado_por` NOT NULL en producción; IA excluida; accionable desde UI y API |
| E10-4 | Rollback documentado + backup previo a migraciones | P0 | rollback a etiqueta previa ejecutable (UC-07); backup automático si la revisión trae migraciones |
| E10-5 | Vista previa por PR | P1 | despliegue efímero por PR si el alcance lo permite |

## E11 Monitoreo (Fase 7 → M4)

| ID | Ítem | P | Criterios |
|---|---|---|---|
| E11-1 | Disponibilidad + versión desplegada | P0 | panel con health y versión por entorno; historial |
| E11-2 | Alertas + correlación despliegues↔errores | P1 | alerta configurable; un despliegue fallido queda correlacionado con evidencia (puerta M4) |

## E12 Seguridad (transversal, Fase 8 → M5)

| ID | Ítem | P | Criterios |
|---|---|---|---|
| E12-1 | Pruebas de aislamiento/secretos/permisos/rutas | P0* | batería S1 como regresión + pruebas T5/T6 del modelo de amenazas (*se ejecutan desde Fase 1, consolidadas en Fase 8) |
| E12-2 | Rate limiting + informe de riesgos | P1 | T1.5 cubierto; informe con residuales aceptados actualizado |

## E13 Distribución (Fase 9 → M6)

| ID | Ítem | P | Criterios |
|---|---|---|---|
| E13-1 | Instalación documentada con Docker Compose | P0 | instalación limpia en máquina virgen siguiendo solo la docs (puerta M6) |
| E13-2 | Backups programados + restauración probada | P1 | backup diario cifrado; restauración en entorno limpio verificada (T8.1) |
| E13-3 | Actualizaciones con migración y vuelta atrás | P1 | actualización + rollback probados (T8.2) |

## E14 Experiencia (Fase 2+ → M2-M4)

| ID | Ítem | P | Criterios |
|---|---|---|---|
| E14-1 | Flujos básicos claros (estados y errores) | P0 | despliegue y tarea muestran estado real (verificando≠exitoso); errores con acción sugerida |
| E14-2 | Bandeja de agentes + diff por bloques | P1 | múltiples tareas IA visibles; diff navegable por bloques |

## Cuenta de cierre M0

- P0 listados: 33 ítems — todos con criterios verificables y fase asignada.
- Los ítems P0 de Fases 1-6 suman la ruta crítica hacia M3; E12-1 se ejecuta desde la Fase 1.
- Fuera de este desglose: P2/P3 (plan §9) — no entran hasta M3 repetible (regla §8).
