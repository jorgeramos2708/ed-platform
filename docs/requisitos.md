# Requisitos con casos de uso priorizados — Fase 0 (entregable M0)

**Fuente:** Plan Maestro §6.2, §8 (hito M3 = criterio central) · **Prioridad:** 🔴 crítica-M3 · 🟠 necesaria-v1.0 · 🟡 deseable
**Regla de alcance (§8):** nada se amplía hasta que M3 pase de forma repetible.

## Casos de uso

### UC-01 🔴 Pedir un cambio en lenguaje natural
- **Actor:** desarrollador · **Hito:** M2 (Fase 2)
- **Flujo:** selecciona proyecto → escribe el cambio → el harness genera **plan** (pasos, archivos afectados) → el plan se muestra antes de ejecutar nada.
- **Criterio de aceptación:** el plan se muestra completo **antes** de cualquier modificación; ninguna escritura ocurre sin plan (L1) o dentro de la autonomía L2 declarada; la ejecución queda en `ejecuciones_ia`.

### UC-02 🔴 Revisar el diff y aceptar o descartar
- **Actor:** desarrollador · **Hito:** M2
- **Flujo:** tras ejecutar el plan, la UI muestra el diff exacto por paso (S4: diff por checkpoint) → aceptar (conserva commits) o descartar (**rewind exacto**, verificado por hash).
- **Criterio:** descartar devuelve el repo al estado previo **byte a byte** (SHA-256 contenido + HEAD, hallazgo autocrlf en ADR-0008); la acción queda auditada.

### UC-03 🔴 Versionar y sincronizar
- **Actor:** desarrollador · **Hito:** M2 (Fase 3)
- **Flujo:** commit atómico desde la UI → push al remoto GitHub (adaptador).
- **Criterio:** un cambio de la IA se confirma y sincroniza sin perder trabajo del usuario (puerta Fase 3); push solo humano (matriz de permisos).

### UC-04 🔴 Construir con CI
- **Actor:** desarrollador / worker · **Hito:** M3 (Fase 5)
- **Flujo:** commit dispara o permite lanzar pipeline → etapas install/lint/test/secretos/build → artefacto con digest.
- **Criterio:** pipeline **reproducible**; resultados y artefactos consultables tras reiniciar la plataforma (puerta Fase 5).

### UC-05 🔴 Desplegar en servidor propio
- **Actor:** desarrollador / operador · **Hito:** M3 (Fase 6)
- **Flujo:** promocionar artefacto (etiqueta+digest) a entorno `desarrollo` → estrategia recreate vía SSH.
- **Criterio:** bloqueo de despliegues concurrentes; el despliegue a producción exige `aprobado_por` humano (decisión 8).

### UC-06 🔴 Verificar salud y versión
- **Actor:** sistema / usuario · **Hito:** M3 (Fase 6)
- **Flujo:** tras desplegar, la plataforma comprueba `GET /health` y `GET /version` (notas-api) → compara versión detectada vs esperada.
- **Criterio:** **comando terminado ≠ aplicación saludable** (puerta Fase 6): `exitoso` exige versión == esperada y health en verde (modelo-datos §10).

### UC-07 🔴 Detectar fallo y recuperarse
- **Actor:** sistema / operador · **Hito:** M3 (Fase 6)
- **Flujo:** `FAIL_HEALTH=1` (notas-api) → health falla → despliegue `fallido` con evidencia → rollback a la etiqueta previa.
- **Criterio:** detección < 5 min (umbral §14); rollback documentado ejecutable desde la UI; backup previo si hay migraciones (§13).

### UC-08 🔴 Continuar tras agotamiento de cuota IA
- **Actor:** ia/harness · **Hito:** M2/M3
- **Flujo:** `QuotaError` tipificado → resumen de estado → failover a proveedor de respaldo (o pregunta al usuario si no hay límite de gasto — decisión 12).
- **Criterio:** mecánica verificada en S5 (ADR-0007): tarea continúa desde el último checkpoint sin duplicar trabajo; con proveedores reales en Fase 2.

### UC-09 🔴 Terminal SSH auditada
- **Actor:** operador/desarrollador · **Hito:** M3 (Fase 4)
- **Flujo:** catálogo de servidores → credencial **por referencia** → terminal web (xterm.js) → comandos registrados → cierre limpio y reconexión controlada (spike S2).
- **Criterio:** no hay exposición de credenciales ni acceso fuera de la matriz usuario/servidor/acción (puerta Fase 4); sesión auditada (compromiso 5).

### UC-10 🟠 Gestionar secretos sin exposición
- **Actor:** admin · **Hito:** M1 (Fase 1)
- **Flujo:** crear secreto (envelope, S6) → usado por trabajos vía **inyección just-in-time** → la IA y los logs nunca ven valores.
- **Criterio:** volcado de BD no revela valores (S6 ✓); redacción en logs verificada en Fase 1 (CONSTRAINTS §1.2).

### UC-11 🟠 Sobrevivir a reinicios
- **Actor:** sistema · **Hito:** M1 (Fase 1)
- **Flujo:** reinicio de servicios → proyectos intactos, trabajos en estados coherentes.
- **Criterio:** puerta Fase 1 — "reiniciar los servicios no pierde proyectos ni deja trabajos en estados incoherentes" (S3 ✓ mecanica; contenedor BD en Fase 1).

### UC-12 🟡 Instalar limpio y recuperar desde backup
- **Actor:** admin · **Hito:** M6 (Fase 9)
- **Criterio:** instalación limpia por documentación + recuperación desde backup probado (puerta M6).

## No funcionales (selección de §11–§14)

- **Local-first:** cero datos fuera del entorno sin acción explícita; indicador binario (§14).
- **Trazabilidad total:** toda mutación auditada en la misma transacción (modelo-datos, convención 3).
- **Usabilidad:** claridad de estados y errores — para el desarrollador solo (aclaración v1.1: el usuario objetivo es desarrollador).
- **Coste IA:** límites de gasto por proyecto con alertas (decisión 11).
