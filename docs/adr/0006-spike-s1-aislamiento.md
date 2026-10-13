# ADR-0006: Spike S1 — Aislamiento de runners

- **Estado:** aceptado (veredicto del spike: **SÍ**, con condición de runtime para producción)
- **Fecha:** 2026-10-13
- **Decisores:** evidencia del spike (`spikes/s1-aislamiento/`)
- **Relaciona:** Plan Maestro §6.1 (S1), decisión 4 (contenedores rootless/Podman), E06 (workspaces), CONSTRAINTS §1.3

## Contexto

El aislamiento de runners es el riesgo de seguridad nº 1 del plan: la IA y los pipelines ejecutan código no confiable. Criterio de éxito: una tarea no puede leer fuera de su workspace ni acceder a otros proyectos.

## Montaje y evidencia

Contenedor de tarea con: `--network none`, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--read-only` (rootfs) + `tmpfs /tmp`, bind mount **solo del workspace**, `--memory` y `--pids-limit`. Batería de 10 pruebas dentro del contenedor (resultados en `spikes/s1-aislamiento/README.md`):

- Capabilities efectivas `0000000000000000`; sin socket de Docker; sin red (`bad address`).
- Rootfs de solo lectura; única zona escribible: el workspace de la tarea.
- El bind mount expone **solo el subárbol del workspace** (verificado por contenido: sin rutas de host, sin otros proyectos, secreto control = 0 hallazgos).
- Límites de recursos aplicados: OOMKilled (137) al retener 200 MB con límite de 64 MB; fork bloqueado al exceder el límite de pids.

## Hallazgos del proceso

1. La línea de montaje 9p muestra `path=C:\` (share interno del driver de Windows) y **podría inducir a error** — el alcance real se verifica por contenido, no por `/proc/mounts`. Prueba de regresión permanente en la Fase 1: el test t2-bis (contenido del workspace + búsqueda del secreto control) pasa en CI de aislamiento.
2. El límite de memoria solo se demuestra con memoria **retenida**: procesos que hacen streaming en tubería no la superan — importante para diseñar las pruebas de la Fase 1.
3. Esta máquina usa Docker Desktop (backend WSL2, rootful dentro de la utility VM). El mecanismo de flags es idéntico en Linux, pero **producción exige rootless/Podman + usuario no-root** (decisión 4) para eliminar el escalado desde el daemon.

## Decisión

La contención con el set de flags validado es **suficiente para los workspaces de la v1.0**, con estas condiciones incorporadas a la Fase 1:

1. Los contenedores de tarea se ejecutan siempre con el set completo de flags (network none salvo salida proxy explícita, cap-drop ALL, no-new-privileges, rootfs read-only + tmpfs, solo bind del workspace, límites de memoria/pids/CPU).
2. Usuario no-root dentro del contenedor de tarea (`--user`).
3. En el servidor de producción (Linux): rootless Docker o Podman, nunca montar `docker.sock` en contenedores de tarea.
4. La batería de este spike se convierte en **prueba de regresión de aislamiento** (CONSTRAINTS §1.3) que corre en cada fase.

## Consecuencias

- E06 puede construirse sobre el mecanismo validado sin esperar a Podman.
- La revisión de seguridad por fase incluye re-ejecutar esta batería.
