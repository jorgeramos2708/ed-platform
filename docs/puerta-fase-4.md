# Puerta Fase 4 — Revisión de salida (Servidores y terminales)

**Fecha:** 2026-10-18 · **Criterios:** Plan Maestro §7 Fase 4 · **Veredicto: FASE 4 CERRADA** ✅

## Criterio de la puerta (§7 Fase 4)

> "El usuario ejecuta comandos y transfiere archivos en un servidor autorizado; no hay exposición de credenciales ni acceso fuera de permisos."

Verificado el **2026-10-18 contra el despliegue real**: servidor SSH auténtico (fixture `edp-sshd-fixture`, linuxserver/openssh-server + ed25519, solo 127.0.0.1), credencial del usuario registrada en el vault de la plataforma (S6) y referida por id.

## Evidencia de la puerta (corrida real)

1. **Comandos ejecutados en el servidor autorizado**: `POST /api/servidores/:id/comandos` con `echo PUERTA-F4 && hostname` → `{"codigo":0,"salida":"PUERTA-F4\n421969c0a18f\n"}` — SSH real (ssh2, montaje del spike S2/ADR-0009).
2. **Transferencia de archivos (SFTP)**:
   - Subida: `POST …/archivos` con base64 → `{ok:true, bytes:54}`.
   - Verificación cruzada: `cat /config/puerta-f4.txt` vía SSH → el contenido exacto.
   - Descarga: `GET …/archivos?ruta=…` → el contenido vuelve íntegro (base64).
3. **Estado y diagnóstico (F4-5)**: `GET …/estado` → `{"vivo":true,"latenciaMs":124}`.
4. **Sin exposición de credenciales**: la credencial vive cifrada en el vault (S6/ADR-0005), referida por id (`credencialId`); el valor se descifra just-in-time y se registra en el Sanitizador — ningún log puede contenerlo (los intentos fallidos de autenticación con clave corrupta aparecieron redactados y sin el valor).
5. **Sin acceso fuera de permisos**:
   - Un usuario SIN permiso concedido: `ejecutar` → **"Acceso denegado: sin permiso de ejecutar"** y `mis-servidores` → `[]` (lista vacía, el servidor no existe para él).
   - Un permiso concedido a un id de usuario inexistente (typo intencional durante la corrida) fue DETECTADO: el acceso siguió denegado — la matriz no perdona ids huérfanos.
   - La terminal (F4-3, WebSocket↔PTY) exige permiso `terminal` específico: solo-ejecutar ≠ terminal (verificado en e2e).

## Entregables de la Fase 4 (§7) — todos presentes

Catálogo de servidores ✓ (UI admin incluida) · credenciales por referencia ✓ (vault + UI de secretos) · terminal SSH interactiva ✓ (WebSocket↔PTY con xterm.js, spike S2/ADR-0009) · SFTP ✓ · estado y diagnóstico ✓ · permisos por usuario/servidor/acción ✓ · auditoría de sesiones ✓ (sesiones_terminal, migración 0007).

## Suites al cierre

Server **93/93** (23 archivos) · Web **19/19** · typecheck 0 · health verde.

## Decisiones y defectos cazados por esta puerta (arreglados)

1. **Dos perfiles de contenedor** (F3-4): tareas S1 sin red vs comandos git fijos con red — la terminal SSH corre en el API (puente ws plano del spike, `TerminalBridgeService`).
2. **La `TerminalGateway` de Nest** (WsAdapter) enredó el enrutado por path y crasheaba el API → descartada por el patrón del spike (lección: el patrón del spike validado gana sobre la abstracción del framework).
3. **La doble conversión CRLF→`\n\n`** corruptó la clave privada al registrarla vía shell — la corrección definitiva: registro de credenciales por script Node con `JSON.stringify` nativo (`registrar-credencial.mjs`) y por la **UI de secretos** (el usuario pega su credencial sin intermediarios).
4. La validación de nombres de servidor rechaza paréntesis (caracteres no seguros) — confirmado en la corrida.

## Deudas declaradas

1. Los 500 de acceso denegado deberían ser 403 (mapeo de errores de dominio → HTTP; P1).
2. Registro de comandos por sesión (`comandos_log_ref` del modelo-datos, P1).
3. Streams SFTP para archivos grandes (P2).
