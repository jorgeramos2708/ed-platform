# ADR-0008: Spike S4 — Agente de IA con herramientas (mecánica del harness)

- **Estado:** aceptado parcialmente (**SÍ** en mecánica; comparación de motores reales diferida a Fase 2)
- **Fecha:** 2026-10-13
- **Decisores:** evidencia del spike (`spikes/s4-agente/`)
- **Relaciona:** Plan Maestro §6.1 (S4), decisión 18 / ADR-0002 (construir vs. integrar), E05 (AI Harness), §19 (packs de skills)

## Contexto

Criterio de éxito: la IA modifica el repo y se puede revertir exactamente; criterio añadido en v1.2: el motor carga packs de skills en formato SKILL.md. El spike valida la **mecánica del harness** con un "LLM" de guion determinista — la calidad y elección de motor real (OpenHands/Aider/LangGraph/harness propio) es la decisión 18, que exige LLM real y queda para el arranque de la Fase 2.

## Montaje y evidencia

Repo de prueba en `%TEMP%` con git CLI (sin dependencias). Plan de 4 pasos generado por el guion: editar (con bug) → prueba roja → corregir → prueba verde. Checkpoint = commit por paso; diff capturado por paso (5/0/4/0 líneas) y agregado inicial→HEAD; rewind con `git reset --hard` verificado por **SHA-256 del contenido + hash de HEAD → EXACTO**. Skills: 2 packs SKILL.md con frontmatter (name/description/prioridad); el loader mínimo matchea por intención y la precedencia elige la de prioridad mayor cuando dos skills coinciden.

## Hallazgos (el valor real del spike)

1. **`core.autocrlf` rompe el rewind byte a byte**: con autocrlf global activo, `reset --hard` reescribe los fines de línea y el contenido difiere del original (`DIFIERE` en el primer run). → **E05 fijará `core.autocrlf=false` en cada workspace** y las verificaciones de rewind usarán SHAs de blob.
2. **Checkpoints de pasos sin cambios de archivos** requieren `--allow-empty` para no romper la línea de tiempo del plan.
3. **Las pruebas del harness deben validar el diff, no solo "que corre"**: el primer test solo verificaba `suma` y el bug de `resta` nunca volvió rojo el bucle.
4. La política de precedencia entre skills (dos packs que matchean la misma intención) se resuelve con un campo de prioridad — misma solución que el dev-stack local aplica en su router.

## Decisión

La mecánica plan → editar → diff → checkpoint → rewind, con bucle editar/prueba/corregir y capa de skills SKILL.md con precedencia, es **construible con git + node sin dependencias exóticas**. E05 se diseña así, dejando abierta la decisión 18 sobre el motor de LLM:

- Checkpoint = commit de git (rewind exacto verificado); diff por paso para la UI.
- Clasificación de errores de herramienta: prueba que falla esperadamente (rojo), prueba que falla inesperadamente (abortar con evidencia), error de entorno.
- Skills: catálogo SKILL.md + precedencia por prioridad; regla anti-conflicto documentada (§19 transversal).

## Consecuencias

- ADR-0002 (construir vs. integrar) permanece **propuesto**: el spike no valida aún coste/calidad con LLM real.
- La puerta M2 reutiliza este repo de prueba como aplicación para "la IA modifica un proyecto, muestra qué cambió y permite aceptar o descartar".
