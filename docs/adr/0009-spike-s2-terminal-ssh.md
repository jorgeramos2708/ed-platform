# ADR-0009: Spike S2 — Terminal SSH web (xterm.js + backend SSH)

- **Estado:** aceptado (veredicto del spike: **SÍ**)
- **Fecha:** 2026-10-13
- **Decisores:** evidencia del spike (`spikes/s2-terminal-ssh/`)
- **Relaciona:** Plan Maestro §6.1 (S2), E08 (servidores y terminales), §19 (xterm.js ya en stack)

## Contexto

Criterio de éxito: sesión interactiva con salida en tiempo real, cierre limpio y reconexión controlada. Arquitectura a validar: **xterm.js (navegador) ← WebSocket ↔ ssh2 (Node) → SSH PTY**.

## Montaje

- **Servidor SSH real en contenedor:** `lscr.io/linuxserver/openssh-server` (puerto 2222, solo clave pública, usuario `spike`, shell /bin/bash).
- **Fase A (backend, ssh2):** conexión con clave ed25519, shell con PTY, medición de tiempos de llegada de dos marcadores separados por `sleep 1`, cierre limpio y reconexión.
- **Fase B (navegador real):** servidor HTTP+WS que puentea WebSocket↔PTY; página con **xterm.js real**; prueba con Playwright + **Edge del sistema** (canal `msedge`, sin descarga de navegadores).

## Evidencia

### Fase A — backend
| Prueba | Resultado |
|---|---|
| Conexión con clave | 277–281 ms ✓ |
| Salida en tiempo real | primer marcador en ~750 ms (< 1 s) ✓ |
| Streaming no bufferizado | segundo marcador +1008 ms (el `sleep 1` se ve progresivo) ✓ |
| Cierre limpio | `conn.end()` → evento `close` sin colgarse ✓ |
| Reconexión | nueva conexión + exec OK (código 0) ✓ |

### Fase B — navegador (Edge headless + xterm.js)
| Prueba | Resultado |
|---|---|
| Teclado → xterm → WS → PTY → eco/salida **renderizada** en `.xterm-rows` | ✓ |
| Cerrar la página cierra la sesión SSH en el backend (`ssh-cerrado` en el log de eventos) | ✓ |
| Reconexión: nueva página = nueva sesión operativa (prompt + `RECON-OK` visibles) | ✓ |

## Hallazgos

1. **PTY echo**: el terminal **repite la línea tecleada**, por lo que un marcador literal aparece en el eco antes de ejecutarse — las pruebas de tiempo real deben usar marcadores construidos por el shell (`echo INICIO-$(echo MARCADOR)`) o filtrar el eco.
2. **Foco en headless**: `keyboard.type` de Playwright no llega al helper de xterm sin `focus()` explícito en cada página; la segunda sesión falló hasta replicar el foco.
3. **Claves sin passphrase vía script**: `ssh-keygen -N '""'` (pwsh) y `-N ""` (cmd) generan claves **encriptadas** por colapso de argumentos vacíos; la forma fiable es `spawnSync('ssh-keygen', [..., '-N', '', ...])` con argv array. El formato OpenSSH no marca "ENCRYPTED" en cabecera — verificar el campo bcrypt binario, no el texto.
4. Un Promise-executor que **retorna** `r` en lugar de **llamarlo** crea un deadlock silencioso (espera del evento `close` que nunca llega porque el código está bloqueado antes de escribir).

## Decisión

La arquitectura **xterm.js + puente WS↔SSH (ssh2)** es viable y estable para E08: se adopta como diseño de la terminal web. Para la Fase 4:

1. Sesiones con PTY + term `xterm-256color`; cierre de sesión al cerrar el WS (verificado).
2. Reconexión con **adjunción a sesión existente** (este spike valida reconexión nueva; la re-adjunción con scrollback es mejora de Fase 4).
3. Auditoría de sesión P0 (v1.1): registro de comandos junto al puente.
4. El puente corre en el backend de la plataforma con la credencial resuelta **por referencia** del vault (nunca al cliente).

## Consecuencias

- S2 cierra la viabilidad de la parte interactiva de E08; SFTP reutiliza la misma conexión ssh2.
- La batería de terminal (tiempo real, cierre, reconexión) entra como prueba de integración de la Fase 4.
