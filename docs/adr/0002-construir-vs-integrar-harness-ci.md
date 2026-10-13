# ADR-0002: Construir vs. integrar — AI Harness y CI (decisión 18 del plan)

- **Estado:** propuesto (se cierra en la puerta M0 con el resultado del spike S4)
- **Fecha:** 2026-10-12
- **Decisores:** Jorge + evidencia de spikes
- **Relaciona:** Plan Maestro §3 (decisión 18), §6.1 (S4, S5), §19 (integraciones candidatas)

## Contexto

El plan asume construir el AI Harness (E05) y el CI (E09) propios, pero §19 documenta motores OSS muy maduros: OpenHands (90.8k ★), Aider (49.5k ★), LangGraph (43.2k ★), Woodpecker (8k ★), Gitea Actions (58.5k ★). Además, la capa de packs de skills (superpowers, ponytail, agent-skills, spec-kit, etc.) exige un mecanismo de carga en formato SKILL.md con política de precedencia entre packs.

## Decisión (propuesta)

- **AI Harness:** construir el bucle propio (plan/act/diff/checkpoint) **sobre** un framework de orquestación (LangGraph o smolagents), y evaluar en el spike S4 si un motor completo (OpenHands) cubre lo necesario con menos esfuerzo. El spike S4 incluye el criterio de carga de packs SKILL.md.
- **CI:** decidir entre Woodpecker autoalojado (sidecar) y runners propios. El escaneo de secretos (gitleaks) y el análisis (trivy) se integran como motores CLI en ambos casos.

## Alternativas consideradas

| Alternativa | Por qué no (o por qué ahora no) |
|---|---|
| Construir todo desde cero | Máximo control, pero mayor coste y riesgo de retraso en M3 (el mayor riesgo del plan, §13) |
| Adoptar OpenHands completo como harness | Lo decidirá S4: riesgo de dependencia fuerte y de UX no alineada con permisos/checkpoints propios |

## Consecuencias

- La decisión se cierra en la puerta M0 pasando este ADR a "aceptado" o "rechazado" con la evidencia del spike.
- Si se integra un motor externo, la capa de skills y su política de precedencia (§19 transversal) se implementa sobre él.
