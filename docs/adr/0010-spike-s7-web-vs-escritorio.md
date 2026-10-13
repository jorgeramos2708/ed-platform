# ADR-0010: Spike S7 — Interfaz web vs. escritorio (Tauri)

- **Estado:** aceptado (veredicto del spike: **SÍ — la web local basta para v1.0; Tauri no se justifica ahora**)
- **Fecha:** 2026-10-13
- **Decisores:** evidencia del spike S2 + análisis de distribución (Fase 9)
- **Relaciona:** Plan Maestro §6.1 (S7), §3 (stack: "Tauri solo si el prototipo lo justifica"), E01/E13

## Contexto

El criterio del spike: "decisión justificada con prototipo". La pregunta real: ¿la experiencia interactiva de la plataforma (terminal, editor, diff) alcanza calidad de escritorio en navegador, o hace falta envolverla con Tauri?

## Evidencia

1. **La pieza interactiva más dura ya funciona en navegador:** el spike S2 (ADR-0009) demostró con **navegador real** (Edge headless + xterm.js + puente WS↔SSH) sesión interactiva en tiempo real, cierre limpio y reconexión — sin plugins ni binarios cliente.
2. **El modelo de acceso de la v1.0 es web por diseño:** acceso por red privada/VPN (decisión 9), instalación con Docker Compose en servidor propio (decisión 7) — el usuario que ejecuta la plataforma ya tiene navegador; una app de escritorio no elimina ningún requisito.
3. **Coste real de Tauri que la v1.0 no paga:** pipeline de empaquetado multiplataforma, canal de actualizaciones del binario cliente (Fase 9 crece), inconsistencias de webview, doble superficie de seguridad (T8). Contra: diálogos nativos, bandeja, shell offline — ninguno es requisito de los flujos v1.0 (§2 dentro-de-alcance).
4. **Escritorio ya está priorizado P3** en el backlog (E01): la decisión no descarta la idea; solo evita pagarla antes de tiempo (control de alcance §11, regla de M3 §8).

## Veredicto

**SÍ: la web local basta para la v1.0.** El "prototipo" que justifica la decisión es el spike S2 (la terminal es la pieza interactiva más exigente y pasó en navegador real) más la naturaleza web-servidor de la plataforma. Tauri queda **descartado para v1.0** y **condicionado** después: solo si tras la Fase 2 aparece una necesidad concreta de usuario (p. ej. entorno de desarrollo offline) — se registrará como ADR nuevo con prototipo real, no por preferencia.

## Consecuencias

- Fase 9 (distribución) queda solo servidor: Docker Compose + guía — menos superficie de empaquetado.
- El backlog mantiene Escritorio en P3; cualquier propuesta de Tauri antes de M3 repetible se rechaza por control de alcance (§8).
- La UI sigue el stack del plan (React + TypeScript, Monaco, xterm.js) como app servida por la propia plataforma.
