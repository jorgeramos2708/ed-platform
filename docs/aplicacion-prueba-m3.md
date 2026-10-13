# Aplicación de prueba para el hito M3

**Objetivo:** una aplicación web en contenedor, deliberadamente simple, para validar el primer flujo completo (Plan Maestro §8) sin ruido de dominio.

## Definición: `notas-api`

- **Stack:** Node.js + Express (o equivalente), imagen < 100 MB, sin base de datos (almacenamiento en memoria).
- **Endpoints:**
  - `GET /health` → `200 {"status":"ok"}` (o `503` si falla)
  - `GET /version` → `{"version":"<semver del build>"}` — la que verificará el CD
  - `GET / POST / DELETE /notes` → CRUD mínimo en memoria
- **Fallo controlado:** variable `FAIL_HEALTH=1` → `/health` responde `503`. Sirve para el paso 8 de M3 (provocar un fallo y comprobar que se detecta).
- **Rollback:** el CD despliega por etiqueta de imagen; volver a la etiqueta anterior es el rollback del paso 9 de M3.

## Criterios de aceptación

1. `docker run` local sirve la API y `/version` refleja la versión del build.
2. `FAIL_HEALTH=1` produce un estado unhealthy verificable.
3. La imagen se construye en un pipeline de la Fase 5 con etapas install → lint → test → build.
