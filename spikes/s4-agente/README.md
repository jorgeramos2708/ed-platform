# Spike S4 — Agente de IA con herramientas (mecánica)

**Pregunta (plan §6.1):** ¿funcionan plan, edición, diff, checkpoint y rewind sobre un repo de prueba? ¿El motor carga packs de skills en formato SKILL.md?
**Criterio de éxito:** la IA modifica el repo y se puede revertir exactamente.
**Veredicto: PASA en la mecánica** (LLM simulado con guion determinista; la comparación de motores reales es la decisión 18 / ADR-0002, para el arranque de la Fase 2).

## Cómo correrlo

```powershell
cd spikes/s4-agente      # sin dependencias: git CLI + node
node spike.mjs           # crea repo de prueba en %TEMP%, ejecuta el plan y limpia
```

## Resultados (13 oct. 2026)

**Plan de 4 pasos con bucle editar → prueba → corregir (TDD rojo-verde):**

| Paso | Herramienta | Resultado | Checkpoint | Diff |
|---|---|---|---|---|
| 1 | editar (agregar `resta()` con bug) | — | commit | 5 líneas |
| 2 | prueba | fallo **como se esperaba** (rojo) | `--allow-empty` | 0 |
| 3 | editar (corregir) | — | commit | 4 líneas |
| 4 | prueba | éxito **como se esperaba** (verde) | `--allow-empty` | 0 |

- **Diff agregado** inicial→HEAD: contiene la función nueva (lo que revisaría el usuario en la UI).
- **Rewind exacto:** `git reset --hard <inicial>` + comparación SHA-256 del contenido + HEAD ⇒ **EXACTO**.
- **Skills:** 2 packs SKILL.md con frontmatter; la intención "tarjeta de saludo" matchea 2 candidatas y la **precedencia por prioridad** elige `saludo-tarjeta` (10 > 1).

## Hallazgo crítico: autocrlf rompe el rewind byte a byte

Con `core.autocrlf=true` (global en esta máquina), `git reset --hard` reescribe los fines de línea del working tree y el contenido deja de ser byte-idéntico al original — el primer run del spike dio `DIFIERE`. **El AI Harness debe fijar `core.autocrlf=false` en cada workspace** (o comparar SHAs de blob en vez de bytes). Segundo hallazgo: los checkpoints de pasos sin cambios de archivos necesitan `--allow-empty` para mantener la línea de tiempo del plan.
