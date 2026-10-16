# ADR-0002: Construir vs. integrar — AI Harness y CI (decisión 18 del plan)

- **Estado:** aceptado (cerrado en la puerta M2 con LLM real, 2026-10-16)
- **Fecha:** 2026-10-12 · **Cierre:** 2026-10-16
- **Decisores:** Jorge + evidencia de spikes + ejecución de la puerta M2
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

## Cierre (puerta M2, 2026-10-16) — veredicto: construir el bucle propio, SIN framework de orquestación

**Decisión final:** el AI Harness es bucle propio y determinista — plan generado por LLM (tras aprobación humana), **ejecución determinista sin LLM** (editar vía base64 + comandos en workspace aislado S1), checkpoints git (S4), failover tipificado (S5), reglas SKILL.md con precedencia (F2-5a) y límite de gasto acumulado (F2-5b) — **sin LangGraph ni OpenHands**.

**Por qué no el framework de orquestación (LangGraph/smolagents):** la ejecución de pasos aprobados no necesita orquestación de LLM — es un pipeline determinista (diffPendiente + commits). El framework añadiría dependencia, abstracción de estado y superficie de fallo para un bucle que cabe en `HarnessService.ejecutarPlan`.

**Por qué no OpenHands como motor:** exactamente el riesgo previsto — UX y modelo de agentes no alineados con los permisos por rol, los checkpoints exactos y el aislamiento S1 propios de la plataforma. La integración habría exigido contener su bucle en lugar de construir el nuestro.

**Evidencia de la puerta M2 (LLM real, NVIDIA NIM `nvidia/nemotron-3-super-120b-a12b`):** plan coherente de 2 pasos generado por el LLM (141/308 tokens) → diff exacto del cambio en workspace aislado → commit aceptado (65d2ec4) → descartar = rewind exacto (head 736421de, workdir vacío). Failover: e2e S5 (cuota tipificada → respaldo) + demo en vivo (principal inalcanzable → respaldo responde). Gasto registrado en `gasto_ia` (migración 0002). Carga de packs SKILL.md implementada nativamente (F2-5a), sin motor externo.

**CI (E09, Fase 3):** la mitad "harness" de este ADR queda cerrada; la elección Woodpecker vs runners propios se decide en la Fase 3 (M3) con este mismo criterio de construcción mínima.
