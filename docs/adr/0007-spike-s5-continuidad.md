# ADR-0007: Spike S5 — Continuidad de IA entre proveedores

- **Estado:** aceptado (veredicto del spike: **SÍ** en la mecánica de continuidad)
- **Fecha:** 2026-10-13
- **Decisores:** evidencia del spike (`spikes/s5-continuidad/`)
- **Relaciona:** Plan Maestro §6.1 (S5), decisión 3/11/12 (proveedores y política de continuidad), E05 (AI Harness)

## Contexto

Criterio de éxito: al simular error de cuota (la simulación está prescrita por el criterio), la tarea continúa desde el último checkpoint con el resumen de estado. El riesgo de negocio: que un agotamiento de cuota frene el trabajo en curso (§13).

## Montaje y evidencia

Harness mínimo sin dependencias con dos proveedores simulados y tareas de 3 pasos; checkpoint persistido tras cada paso; log de ejecución acumulado en JSONL.

1. **Failover en proceso:** A completa pasos 1-2; al iniciar el 3 lanza `QuotaError` → el harness escribe resumen de estado y pasa a B, que completa la tarea. Salida completa y en orden; 3 ejecuciones para 3 pasos.
2. **Crash + reanudación en proceso nuevo:** el proceso muere (`exit 1`) tras el paso 2. El proceso nuevo lee el checkpoint (`pasoCompletado: 2`), **no re-ejecuta** los pasos previos, intenta el 3 con A (cuota) → failover a B → tarea completa. El log acumulado entre ambos procesos demuestra: cero trabajo perdido, cero duplicado.

## Aprendizajes

- El checkpoint útil no es solo "último paso completado": necesita el **resumen de estado** que el proveedor entrante puede consumir (qué está hecho, qué queda, cómo no repetir).
- El proveedor debe **tipificar** el error de cuota (distinto de un fallo de red): el harness solo hace failover en el primer caso; en el segundo, reintenta o aborta con evidencia.
- El log acumulado de ejecuciones es la evidencia que permite auditar que no hubo duplicación — entra en el diseño de auditoría (compromiso 5).

## Decisión

La mecánica de continuidad (checkpoint por paso + resumen de estado + failover tipificado) se incorpora al diseño de E05 con estas reglas:

1. Checkpoint tras cada paso atómico de la tarea, con resumen legible por cualquier proveedor.
2. Failover automático solo con límite de gasto definido; por defecto se **pregunta** (decisión 12) — el harness prepara el resumen y espera aprobación.
3. Los errores de proveedor se clasifican: cuota (failover), transitorio (reintento con backoff), permanente (abortar con evidencia).

## Consecuencias

- Validación con **proveedores reales** (formatos de conversación, límites por API, idempotencia del re-envío) queda para el arranque de la Fase 2 — es integración, no mecanismo.
- La política de continuidad y sus límites de gasto aparecen en la puerta M2.
