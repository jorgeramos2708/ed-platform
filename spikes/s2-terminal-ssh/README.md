# Spike S2 — Terminal SSH web (xterm.js + backend SSH)

**Pregunta (plan §6.1):** ¿xterm.js con un backend SSH da una experiencia estable?
**Criterio:** sesión interactiva con salida en tiempo real, cierre limpio y reconexión controlada.
**Veredicto: PASA** (ADR-0009) — backend con ssh2 y navegador real con xterm.js.

## Requisitos

- Contenedor sshd: `edp-spikes-ssh` (puerto 2222, solo clave pública).
- Node 24. Paquetes: `ssh2`, `ws`, `@xterm/xterm`, `playwright-core` (usa **Edge/Chrome del sistema** — sin descarga de navegadores).

## Cómo correrlo

```powershell
# clave sin passphrase (argv array — ver ADR-0009 hallazgo 3)
node -e "const { spawnSync } = require('node:child_process'); spawnSync('ssh-keygen', ['-t','ed25519','-f','spike-key','-N','','-C','spike-s2'], { stdio: 'inherit' })"

# sshd con la pública
$pub = (Get-Content spike-key.pub -Raw).Trim()
docker run -d --name edp-spikes-ssh -p 2222:2222 -e PUID=1000 -e PGID=1000 `
  -e USER_NAME=spike -e PUBLIC_KEY="$pub" -e PASSWORD_ACCESS=false lscr.io/linuxserver/openssh-server:latest

npm install
node fase-a.mjs    # backend: PTY en tiempo real + cierre + reconexión
node fase-b.mjs    # navegador: Edge headless + xterm.js contra el puente WS->SSH
docker stop edp-spikes-ssh
```

## Resultados (13 oct. 2026)

| Prueba | Fase A (backend) | Fase B (navegador) |
|---|---|---|
| Conexión | 277 ms ✓ | ws+PTY abiertas ✓ |
| Tiempo real | marcador 1 en ~750 ms ✓ | teclado → render en xterm ✓ |
| Streaming progresivo | marcador 2 a +1008 ms ✓ | — |
| Cierre limpio | evento close sin colgar ✓ | página cerrada → `ssh-cerrado` en backend ✓ |
| Reconexión | exec OK (código 0) ✓ | nueva sesión con prompt + salida ✓ |

## Archivos

- `fase-a.mjs` — backend ssh2 (medición de tiempos reales).
- `server.mjs` — puente HTTP+WS ↔ SSH PTY (el diseño que adopta E08).
- `index.html` — xterm.js mínimo conectado al puente.
- `fase-b.mjs` — prueba Playwright con Edge del sistema.
- `spike-key` — **clave privada de prueba, gitignored**; `s2-estado.jsonl` — log de eventos, gitignored.
