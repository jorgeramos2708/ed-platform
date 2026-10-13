# Spike S5 — Continuidad de IA (failover de proveedor)

**Pregunta (plan §6.1):** ¿se puede cambiar de proveedor a mitad de una tarea sin perder estado?
**Criterio de éxito:** al simular error de cuota, la tarea continúa desde el último checkpoint con el resumen de estado (la simulación está prescrita por el propio criterio).
**Veredicto: PASA** (mecánica de continuidad; ver ADR-0007 para el alcance).

## Cómo correrlo

```powershell
cd spikes/s5-continuidad        # no requiere dependencias (node:fs puro)
node spike.mjs failover          # escenario 1: failover en el mismo proceso
node spike.mjs precrash          # escenario 2a: proceso muere antes del paso 3 (exit 1)
node spike.mjs resume            # escenario 2b: proceso NUEVO reanuda desde checkpoint
```

## Resultados (13 oct. 2026)

**Escenario 1 — failover en proceso:** pasos 1-2 por `proveedor-A`; cuota agotada al iniciar el 3 → resumen de estado escrito → `proveedor-B` completa el paso 3. Salida completa, en orden, sin duplicados.

**Escenario 2 — crash + resume en proceso nuevo:** el proceso muere tras el paso 2 (`exit 1`); el proceso nuevo lee `checkpoint.json` (`pasoCompletado: 2`), **no re-ejecuta** los pasos 1-2, intenta el 3 con A (cuota agotada) → failover a B → tarea completa. El log acumulado `log-ejecucion.jsonl` demuestra **3 ejecuciones para 3 pasos** entre ambos procesos: cero trabajo perdido, cero duplicado.

## Artefactos por escenario

- `checkpoint.json` — `{tareaId, pasoCompletado, proveedor, resumen}` (el resumen es lo que el proveedor entrante necesita).
- `salida.txt` — artefacto de la tarea.
- `log-ejecucion.jsonl` — evidencia de quién ejecutó qué (apéndice, no se trunca entre procesos).
