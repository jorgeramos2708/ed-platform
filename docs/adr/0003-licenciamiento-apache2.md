# ADR-0003: Licenciamiento del producto — Apache-2.0 (decisión 17 del plan)

- **Estado:** aceptado
- **Fecha:** 2026-10-12
- **Decisores:** Jorge (propietario del proyecto)
- **Relaciona:** Plan Maestro §3 (decisión 17), §19 (integraciones candidatas), `LICENSE` del repositorio

## Contexto

La decisión 17 quedó abierta en el plan v1.1 ("a decidir en Fase 0"). Al crear el repositorio en GitHub, el propietario seleccionó Apache-2.0 y ha confirmado que la elección fue intencional.

## Decisión

ED Platform se distribuye bajo **Apache License 2.0** (ya presente como `LICENSE` en github.com/jorgeramos2708/ed-platform).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| MIT | Equivalente en la práctica; Apache-2.0 añade grant explícito de patentes, relevante para una plataforma que integra muchos componentes de terceros |
| AGPL-3.0 | Copyleft de red fuerte: complica la integración de dependencias y el modelo de distribución (Fase 9) |
| Propietario | Contradice la vocación local-first del plan y el catálogo de integraciones §19 |

## Consecuencias

- Compatibilidad confirmada con las dependencias MIT/Apache/BSD del catálogo §19; los AGPL (Plane, Grafana, TruffleHog, Semgrep) siguen limitados a sidecar sin modificación.
- Antes de aceptar PRs externos (Fase 9) se definirá la política de contribución (DCO o CLA) coherente con Apache-2.0.
