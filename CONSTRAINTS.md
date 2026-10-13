# CONSTRAINTS.md — Barra de calidad de ED Platform

**Versión:** 1.2 · **Fuente:** Plan Maestro v1.2 (§11 Gobierno, §12 Pruebas, §13 Riesgos) · **Regla de vigencia:** cualquier bajada de umbral requiere ADR registrado. Este contrato manda sobre preferencias de implementación; la lente ponytail nunca recorta tests, validación, seguridad ni accesibilidad.

---

## 1. No negociable (bloquea merge o cierre de fase)

1. **Tests:** toda lógica nueva lleva pruebas unitarias; los módulos con I/O (API, base de datos, Git, runners, conectores) llevan integración. Ningún merge con pruebas fallando o saltadas.
2. **Secretos:** cero secretos en código, logs, base de datos o historial de IA. Escaneo de secretos en cada pipeline; la IA nunca ve valores, solo referencias (inyección just-in-time).
3. **Aislamiento:** ningún runner/workspace puede leer fuera de su espacio ni alcanzar otros proyectos. El criterio del spike S1 se convierte en prueba de regresión permanente.
4. **Permisos:** toda acción sensible pasa por la matriz de permisos. Denegado por defecto; se concede por rol y por recurso.
5. **Verificación de despliegue:** un despliegue solo se marca exitoso con la versión esperada activa y health checks en verde (compromiso 2 del producto). Comando terminado ≠ aplicación saludable.
6. **Producción:** aprobación humana siempre (decisión 8). Sin excepciones ni banderas para saltarla.
7. **Local-first:** nada sale del entorno sin acción explícita del usuario; todo envío externo (proveedor de IA, Git remoto) queda auditado.
8. **Auditoría:** cambios, ejecuciones, despliegues, sesiones y acciones administrativas quedan registrados antes de considerarse "hecho".
9. **Backups:** cifrados, con prueba de restauración programada; una restauración no probada cuenta como inexistente.

## 2. Umbrales de calidad por cambio

- La lógica crítica (secretos, permisos, cola de trabajos, failover de IA, rollback) requiere pruebas explícitas de sus caminos de fallo, no solo del camino feliz.
- Commits atómicos (~100 líneas), convencionales, con el porqué en el cuerpo (contextual-commit).
- Prohibido introducir `@ts-ignore` / `eslint-disable` / tests saltados o borrados / aserciones eliminadas sin comentario `shortcut:` + entrada en la deuda (ponytail-debt); si es estructural, ADR.
- Logs estructurados en toda operación; errores con contexto accionable (qué, dónde, con qué evidencia).
- Todo atajo deliberado se marca `shortcut:` en el código; la deuda se cosecha y se revisa, nunca se olvida.

## 3. Puerta de cada fase (fuente: §11 del plan)

Salida solo con: criterios de aceptación cumplidos · pruebas pasando · revisión de seguridad de la fase hecha (no solo en la Fase 8) · riesgos documentados · errores críticos corregidos · **evidencia consultable** (comandos y salidas, no afirmaciones) · commits de la fase empujados a `origin/main` (github.com/jorgeramos2708/ed-platform).

## 4. Definición de "hecho"

Criterios de aceptación cumplidos · pruebas relevantes pasando · logs y auditoría presentes · sin secretos en el código · documentación actualizada.

## 5. Control de alcance

- Nada nuevo entra en una fase en curso sin retirar algo equivalente; todo lo demás va al backlog con prioridad.
- Ningún módulo se amplía (nuevos proveedores, Windows, estrategias avanzadas) hasta que M3 pase de forma repetible.

## 6. Violaciones típicas que este contrato debe detectar

- Supresión nueva (`@ts-ignore`, `eslint-disable`, `skip`) sin justificación → rechazar.
- Test borrado o aserción eliminada para que pase → rechazar.
- Umbral editado a la baja sin ADR → rechazar.
- "Ya lo probaré en Fase 8" → la seguridad se revisa por fase; rechazar.
- Cambio de proveedor, prompt o reglas de IA sin ejecutar la evaluación de referencia (§11) → rechazar.
