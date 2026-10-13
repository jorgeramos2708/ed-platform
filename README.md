# ED Platform

Plataforma **local-first** que unifica el ciclo completo de una aplicación: desarrollo asistido por IA, Git, CI/CD, gestión de servidores, terminales remotas y verificación posterior al despliegue.

**Lema:** *Alinea, ejecuta, verifica, cierra.*

> Estado: **Fase 0 en curso** (especificación y spikes). Referencia: [Plan Maestro v1.2](docs/ED-Platform-Plan-Maestro.md).

## Documentación clave

| Documento | Qué es |
|---|---|
| [Plan Maestro v1.2](docs/ED-Platform-Plan-Maestro.md) | Qué, cuándo, orden y decisiones (fases 0–9, hitos M0–M6, integraciones §19) |
| [CONSTRAINTS.md](CONSTRAINTS.md) | Contrato de calidad — no negociable, manda sobre preferencias de implementación |
| [Aplicación de prueba M3](docs/aplicacion-prueba-m3.md) | La app mínima (`notas-api`) que valida el primer flujo completo |
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

## Entorno de desarrollo

- **Windows:** WSL2 + Docker Desktop (documentar la instalación específica al arrancar la Fase 1).
- **Linux nativo:** soportado directamente.
- **Requisitos** (stack del plan §3): Git, Node.js LTS, PostgreSQL, Docker rootless o Podman.

## Próximos pasos (Fase 0)

1. Ejecutar los spikes S1–S7 (semanas 2–4 del plan §10), cada uno con resultado *sí/no/ajuste* en un ADR.
2. Cerrar la puerta M0: modelo de datos, matriz de permisos, modelo de amenazas validado, backlog priorizado, ADRs de las decisiones 1–18.
