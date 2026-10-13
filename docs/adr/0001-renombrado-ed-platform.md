# ADR-0001: Renombrado del proyecto a ED Platform y adopción del Plan Maestro v1.2

- **Estado:** aceptado
- **Fecha:** 2026-10-12
- **Decisores:** Jorge (propietario del proyecto)
- **Relaciona:** Plan Maestro v1.2 (§15 Identidad de marca, §18 Registro de cambios)

## Contexto

El proyecto nació como **BerthIA** (metáfora portuaria). El propietario decidió renombrarlo a **ED Platform**. El plan maestro quedó parcheado con 7 parches de completitud (v1.1), renombrado (v1.2) y ampliado con el catálogo de integraciones §19 (34 herramientas OSS por fase del flujo + packs de skills transversales). La reserva de dominio y nombres existente fue hecha para BerthIA y no cubre el nuevo nombre.

## Decisión

- El producto se llama **ED Platform**; repositorio y paquetes: `ed-platform`; CLI: `edp` (evita la colisión con el editor Unix `ed`).
- Se adopta el **Plan Maestro v1.2** como referencia de qué/cuándo/orden/decisiones, y **CONSTRAINTS.md** (raíz del repo) como contrato de calidad.
- El vocabulario náutico de la etapa BerthIA queda descartado salvo decisión en contrario.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Mantener BerthIA | Decisión de marca del propietario (se asume rehacer dominio/marcas) |
| CLI `ed` | Colisiona con el editor Unix clásico y herramientas existentes |

## Consecuencias

- Pendiente: rehacer reserva de dominio y revisión de marcas para "ED Platform"; definir qué significa "ED" (p. ej. *Entorno de Desarrollo*); renombrar el documento de arquitectura complementario (v1.3).
- Las referencias históricas a BerthIA en el plan (changelog §18, riesgos §13) se conservan a propósito como contexto.
