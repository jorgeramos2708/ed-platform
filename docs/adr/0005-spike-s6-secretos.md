# ADR-0005: Spike S6 — Almacén de secretos con cifrado por capas

- **Estado:** aceptado (veredicto del spike: **SÍ**)
- **Fecha:** 2026-10-12
- **Decisores:** evidencia del spike (`spikes/s6-secretos/`)
- **Relaciona:** Plan Maestro §6.1 (S6), E03 (secretos), CONSTRAINTS §1.2

## Contexto

Criterio de éxito del spike: un volcado de la base de datos no revela ningún secreto. Diseño propuesto: cifrado por capas (envelope encryption) con la clave maestra fuera de la base de datos.

## Montaje

- **Envelope encryption con AES-256-GCM** (`node:crypto`, sin dependencias externas):
  1. Clave maestra (32 B aleatorios) en archivo **fuera de la BD y del repo** (`%TEMP%\edp-s6-master.key`, modo 0600).
  2. Por cada secreto: DEK aleatoria de 32 B → secreto cifrado con la DEK; DEK envuelta (cifrada) con la clave maestra.
  3. Tabla PostgreSQL `secretos` con `enc_dek, dek_iv, dek_tag, ciphertext, iv, tag` como `bytea` — los nombres en claro por diseño (el valor es lo secreto).
- Tres secretos de prueba con fragmentos inconfundibles: `sk-live-…`, `SuPerSecreto-…`, `ghp_…`.

## Evidencia

1. **Round-trip 3/3:** con la clave maestra se desenvuelve cada DEK y se recupera el valor original (comparación exacta contra el original en memoria).
2. **Volcado:** `pg_dump --table=secretos` → 2.968 bytes de ciphertext hex + metadatos.
3. **Grep del volcado** con `sk-live|SuPerSecreto|ghp_` → **0 coincidencias**. → **Criterio de éxito cumplido: el volcado no revela ningún secreto.**

## Aprendizajes

- `dec()` debe devolver **Buffer**, no string: convertir una DEK binaria (32 B aleatorios) a UTF-8 corrompe los bytes y produce "Invalid key length" al reutilizarla. Los valores de texto se convierten solo al final.
- Los nombres de los secretos quedan en claro por diseño; si se necesitara ocultarlos también, se cifran igual que los valores.

## Decisión

Viabilidad confirmada para E03: cifrado por capas con clave maestra externa. La implementación de la Fase 1 añadirá: rotación de la clave maestra, derivación desde passphrase de administrador (argon2/PBKDF2), claves por proyecto y redacción de secretos en logs (CONSTRAINTS §1.2).

## Consecuencias

- La clave maestra vive fuera de la BD (archivo con permisos restringidos o KMS local) — su pérdida implica perder los secretos: entra en el plan de backups (decisión 15) como fichero cifrado aparte.
- El volcado de prueba (`volcado.sql`) queda como artefacto local gitignored.
