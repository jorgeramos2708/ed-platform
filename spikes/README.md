# Spikes de la Fase 0

Pruebas de concepto de riesgo (plan §6.1). Cada spike cierra en un ADR con veredicto *sí/no/ajuste*.

## Requisitos

- Docker (contenedor dedicado `edp-spikes-postgres`, PostgreSQL 16, puerto **55432** — aislado de otros proyectos de la máquina).
- Node.js 24.

```powershell
# Preparar el contenedor (si está parado)
docker start edp-spikes-postgres
```

## S3 — Trabajos persistentes (pg-boss v12) → **PASA** (ADR-0004)

```powershell
cd spikes/s3-trabajos
npm install
node spike.mjs setup   # esquema + colas
node spike.mjs crash   # worker muere con job activo (exit 1 esperado)
node spike.mjs resume  # proceso nuevo: re-entrega + cancelación
```

## S6 — Secretos cifrados por capas → **PASA** (ADR-0005)

```powershell
cd spikes/s6-secretos
npm install
node spike.mjs                          # envelope encryption + round-trip
docker exec edp-spikes-postgres pg_dump -U spike -d spike --table=secretos > volcado.sql
Select-String volcado.sql -Pattern "sk-live|SuPerSecreto|ghp_"   # esperado: 0 coincidencias
```

## Notas

- La clave maestra de prueba vive en `%TEMP%\edp-s6-master.key` (fuera del repo y de la BD).
- `volcado.sql` y `job-id.txt` son artefactos locales, gitignored.
- Al terminar la sesión de spikes: `docker stop edp-spikes-postgres`.
