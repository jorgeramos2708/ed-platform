# ADR-0004: Spike S3 — Trabajos persistentes con pg-boss v12 sobre PostgreSQL

- **Estado:** aceptado (veredicto del spike: **SÍ**)
- **Fecha:** 2026-10-12
- **Decisores:** evidencia del spike (`spikes/s3-trabajos/`)
- **Relaciona:** Plan Maestro §6.1 (S3), §3 (stack), E04 (colas y workers)

## Contexto

El plan dejaba abierta la cola de trabajos: PostgreSQL (pg-boss) o Redis (BullMQ), según el spike. Criterio de éxito: un trabajo en curso se recupera o falla de forma coherente tras reiniciar, y se puede cancelar.

## Montaje

- PostgreSQL 16 en Docker (contenedor dedicado `edp-spikes-postgres`, puerto 55432) + **pg-boss 12.37.1**.
- Tres fases en procesos separados: `setup` (esquema + colas) → `crash` (worker inicia un job de 1,5 s y muere con `process.exit(1)`, dejándolo huérfano en `active`) → `resume` (proceso **nuevo** espera la re-entrega y lo completa; luego cancela un job pendiente).

## Evidencia

1. `crash`: job `313db1ea…` encolado, worker lo inicia (`retryCount = 0`) y muere con el job activo (`exit 1`, esperado).
2. `resume`: un proceso nuevo recibe el job **re-entregado** (`retryCount = 1`) tras expirar el lock de 2 s; estado final `completed`. → **S3-recuperacion-tras-reinicio: PASA**
3. Cancelación de un job pendiente (`startAfter` en el futuro) → estado `cancelled`. → **S3-cancelacion: PASA**
4. El job sobrevivió el reinicio del proceso porque vive en PostgreSQL (persistencia de la cola demostrada entre reinicios de aplicación).

## Aprendizajes (pg-boss v12)

- **Modelo queue-first:** hay que llamar a `createQueue(name)` antes de enviar; si no, `send()` devuelve `null` **sin error** (el INSERT hace join con `pgboss.queue` y no inserta nada).
- La metadata del job (estado, `retryCount`) llega con `includeMetadata: true` en `work()`; no existe `deliverCount`.
- `expireInSeconds` se mapea internamente a `expireIn`; `maintenanceIntervalSeconds` acelera la re-entrega tras expirar locks (útil para tests, no para producción).

## Decisión

Adoptar **pg-boss v12 sobre PostgreSQL** como cola de trabajos de la v1.0: cola y datos de negocio en un solo motor — backups, migraciones y operación unificados (local-first). Redis/BullMQ queda descartado para la v1.0; se reevaluará solo si aparecen requisitos de latencia/throughput no cubiertos.

## Consecuencias

- El stack del plan (§3) se actualiza: cola = pg-boss sobre PostgreSQL.
- La puerta de la Fase 1 ("reiniciar los servicios no deja trabajos en estados incoherentes") hereda este mecanismo y añadirá el caso de reinicio del propio contenedor de PostgreSQL.
