# ED Platform

Plataforma **local-first** que unifica el ciclo completo de una aplicación: desarrollo asistido por IA, Git, CI/CD, gestión de servidores, terminales remotas y verificación posterior al despliegue.

**Lema:** *Alinea, ejecuta, verifica, cierra.*

> Estado: **Puerta M0 cerrada** (2026-10-13, 7/7 spikes SÍ) — listo para la **Fase 1** (Núcleo y UI). Referencia: [Plan Maestro v1.3](docs/ED-Platform-Plan-Maestro.md) · [Registro de la puerta](docs/puerta-m0.md).

## Documentación clave

| Documento | Qué es |
|---|---|
| [Plan Maestro v1.2](docs/ED-Platform-Plan-Maestro.md) | Qué, cuándo, orden y decisiones (fases 0–9, hitos M0–M6, integraciones §19) |
| [CONSTRAINTS.md](CONSTRAINTS.md) | Contrato de calidad — no negociable, manda sobre preferencias de implementación |
| [Aplicación de prueba M3](docs/aplicacion-prueba-m3.md) | La app mínima (`notas-api`) que valida el primer flujo completo |
| [Modelo de datos](docs/modelo-datos.md) | Entidades, estados reales y convenciones (entregable M0) |
| [Matriz de permisos](docs/matriz-permisos.md) | Roles, autonomía de la IA y límites de confianza (entregable M0) |
| [Modelo de amenazas](docs/modelo-amenazas.md) | STRIDE por frontera con evidencia de spikes (entregable M0) |
| [ADRs](docs/adr/) | Decisiones de arquitectura (plantilla + registro) |

## Estructura del monorepo

```
apps/web/         UI (React + TypeScript, Monaco, xterm.js)
apps/server/      API (TypeScript / NestJS)
packages/shared/  Tipos y contratos compartidos
docs/adr/         Decisiones de arquitectura (ADR)
docs/             Plan maestro, aplicación de prueba M3
```

## Convenciones

- **Commits contextuales:** qué en el subject (Conventional Commits), porqué en el cuerpo con líneas de acción (`intent:`, `decision:`, `rejected:`, `constraint:`, `learned:`).
- **Decisiones → ADR:** toda decisión técnica relevante se registra en `docs/adr/` con la plantilla; los spikes S1–S7 cierran cada uno en un ADR.
- **Calidad:** `CONSTRAINTS.md` manda. Nada de `@ts-ignore`, tests saltados o umbrales bajados sin ADR. Atajos deliberados: comentario `shortcut: <límite>, <cuándo subirlo>`.
- **Control de alcance:** nada nuevo entra en una fase en curso sin retirar algo equivalente; el backlog vive en el Plan Maestro §9.
- **Commits atómicos** (~100 líneas), `main` siempre desplegable, ramas de vida corta.
- **Cierre de fase:** cada fase (o hito) termina con commit y push a `origin/main` ([jorgeramos2708/ed-platform](https://github.com/jorgeramos2708/ed-platform)); las pruebas se ejecutan en local (CI propio llega en la Fase 5).

## Entorno de desarrollo y ejecución

- **Ejecución v1.0:** Windows 10/11 con WSL2 + Docker Desktop; lanzador `edp.exe` (.NET 8 self-contained) arranca el stack y abre la UI en el navegador (ADR-0011). PostgreSQL corre en contenedor.
- **Linux nativo:** instalación futura (P2, ADR-0011).
- **Requisitos para desarrollar:** Git, Node.js LTS, Docker Desktop (ya validados por los spikes); .NET 8 SDK solo para construir el lanzador.
- **Validación por cambio:** reconstruir `edp.exe` + tests locales + health del compose (≈ minutos); instalador completo solo en puertas de fase.

## Próximos pasos (Fase 1 — Núcleo y UI, M1)

1. Scaffold real del monorepo (`apps/web`, `apps/server`, `packages/shared`) con TDD desde el primer endpoint.
2. Núcleo: auth+roles, proyectos, cola pg-boss + workers, vault de secretos (S6), auditoría y logs estructurados.
3. Esqueleto del lanzador `edp.exe` para validar cada cambio ejecutándolo.
