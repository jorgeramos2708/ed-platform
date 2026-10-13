# ADR-0011: Distribución v1.0 — instalación en Windows con lanzador `edp.exe`

- **Estado:** aceptado
- **Fecha:** 2026-10-13
- **Decisores:** Jorge (propietario) — confirmado en sesión (lanzador + .NET 8 + PostgreSQL en contenedor)
- **Relaciona:** Plan Maestro §2, decisiones 4 y 7, Fase 9, ADR-0006 (aislamiento), ADR-0010 (web-first)

## Contexto

El propietario confirma que la plataforma debe **instalarse en Windows** por ahora (Linux después), con validación de cada cambio mediante un `.exe`. El plan v1.3 asumía instalación por Docker Compose en servidor Linux. Prerrequisitos disponibles y verificados: WSL2 + Docker Desktop (usados por los spikes S1–S3/S6).

## Decisión

1. **UI sin cambios (ADR-0010 se mantiene):** el `.exe` es el **lanzador/instalador de la plataforma**, no una app de escritorio con la UI dentro — la interfaz sigue siendo web en el navegador.
2. **Lanzador `edp.exe`** (.NET 8 self-contained, Windows 10/11): detecta/arranca Docker Desktop, levanta el stack (compose interno), espera health checks y abre la UI. Se reconstruye en cada cambio para validar (launcher + tests + health ≈ minutos; instalador completo solo en puertas de fase).
3. **PostgreSQL en contenedor** (mismo motor validado en S3/S6) — el instalador exige Docker Desktop con diagnóstico de prerequisitos (WSL2 habilitado, Docker corriendo).
4. **Fase 9 = Instalador Windows:** instalador, actualizaciones con migración y vuelta atrás, desinstalación limpia, backups y guía de administración. La instalación Linux queda como **P2 futuro**.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| App de escritorio con UI embebida (Tauri) | Revertiría ADR-0010; empaquetado y actualizaciones desde la Fase 1 sin requisito que lo justifique |
| PostgreSQL nativo Windows embebido | Duplica el motor y engorda el instalador; el contenedor ya está validado |
| Tauri CLI (Rust) para el lanzador | Toolchain extra para un trabajo que .NET self-contained hace nativo |
| Instalador completo reconstruido por cambio | Anti-incremental: minutos de suite+health vs. instalador solo en puertas |

## Consecuencias

- **Decisión 4** pasa a "host Windows v1.0 (Docker Desktop/WSL2)"; **decisión 7** a "instalación local Windows con `edp.exe`" — Compose queda como motor interno.
- **La condición de ADR-0006** (rootless/Podman) aplica a la instalación Linux futura; para la v1.0 Windows el runtime es Docker Desktop — **riesgo residual aceptado** (usuario administrador de su propia máquina, alcance personal/equipo pequeño) y registrado en el modelo de amenazas.
- **La batería S1 gana representatividad:** corre exactamente en el runtime de producción v1.0 (Docker Desktop).
- Fase 9 crece (~1–2 semanas); Fase 1 añade el esqueleto del lanzador (~2–3 días).
- Riesgo nuevo en §13: dependencia de WSL2/Docker Desktop en el cliente (mitigado con diagnóstico de instalación).
