# Puerta M0 — Revisión de salida de la Fase 0

**Fecha:** 2026-10-13 · **Criterios:** Plan Maestro §6.3 · **Veredicto: M0 CERRADA** ✅

## Criterios de salida (§6.3)

1. ✅ **Los siete spikes tienen resultado documentado** — ADRs 0004–0010, todos ejecutados localmente con evidencia.
2. ✅ **Cada módulo de la v1.0 tiene alcance, entradas, salidas y criterios de aceptación** — [requisitos.md](requisitos.md) (UC-01…UC-12), [backlog.md](backlog.md) (33 ítems P0 con criterios verificables por épica y fase), alcance por fase en el plan §7.
3. ✅ **Las decisiones de la sección 3 están aceptadas o modificadas y registradas** — tabla §3 v1.2 + ADRs 0001, 0003, 0006–0010; decisión 18 registrada como propuesta (ADR-0002) con cierre en Fase 2 por diseño del spike S4.

## Spikes: 7/7 con veredicto

| Spike | Veredicto | ADR | Hallazgo clave |
|---|---|---|---|
| S1 Aislamiento de runners | SÍ (cond. runtime) | [0006](adr/0006-spike-s1-aislamiento.md) | Contención en 10 pruebas; bind solo al workspace **verificado por contenido**; batería = regresión permanente |
| S2 Terminal SSH web | SÍ | [0009](adr/0009-spike-s2-terminal-ssh.md) | xterm.js + puente WS↔SSH estable en navegador real; PTY echo y foco headless |
| S3 Trabajos persistentes | SÍ | [0004](adr/0004-spike-s3-trabajos-persistentes.md) | pg-boss v12 (queue-first); recuperación tras crash y cancelación |
| S4 Agente de IA | SÍ (mecánica) | [0008](adr/0008-spike-s4-mecanica-agente.md) | Rewind exacto exige `autocrlf=false`; skills SKILL.md con precedencia |
| S5 Continuidad de IA | SÍ (mecánica) | [0007](adr/0007-spike-s5-continuidad.md) | Checkpoint + resumen de estado; cero pérdida/duplicación entre procesos |
| S6 Almacén de secretos | SÍ | [0005](adr/0005-spike-s6-secretos.md) | Volcado de BD + grep = 0 coincidencias |
| S7 Web vs. escritorio | SÍ (web basta) | [0010](adr/0010-spike-s7-web-vs-escritorio.md) | Tauri descartado para v1.0; Escritorio queda P3 condicionado |

## Estado de las decisiones 1–18

- **1–16:** recomendadas en §3 del plan, aplicadas por defecto en spikes y documentación.
- **17 Licenciamiento: cerrada** — Apache-2.0 (ADR-0003).
- **18 Construir vs. integrar: registrada como propuesta** (ADR-0002) — la comparación de motores exige LLM real y pertenece al arranque de la Fase 2.

## Pendientes declarados (no bloquean la puerta)

- Validación de continuidad con proveedores de IA **reales** → arranque de la Fase 2 (S5: mecánica ✓).
- Re-adjunción de sesión de terminal con scrollback → Fase 4 (S2: reconexión nueva ✓).
- Re-evaluar Tauri solo con necesidad concreta post-Fase 2 (ADR-0010).

## Verificación de cierre

- **Repeatabilidad:** spike S5 re-ejecutado el día del cierre → PASA.
- **Todo empujado:** commits `053126e…96b9835` en `origin/main` (github.com/jorgeramos2708/ed-platform); pruebas locales (Docker + Node + Edge).
- **Stack actualizado por evidencia:** cola = pg-boss v12 sobre PostgreSQL (sin Redis); Tauri fuera.

**Siguiente paso: Fase 1 — Núcleo y UI (M1):** monorepo, API, PostgreSQL, autenticación+roles, cola+workers, vault, auditoría, logs estructurados y compose de desarrollo. Desde el primer commit rigen como regresión permanente: batería S1, prueba de volcado sin secretos (S6) y la matriz de permisos en código (CONSTRAINTS §1).
