# Modelo de amenazas — Fase 0 (entregable M0)

**Fuente:** Plan Maestro §6.2, §13 · **Método:** STRIDE por frontera de confianza (fronteras definidas en [matriz-permisos.md](matriz-permisos.md)) · **Vigencia:** se revalida en cada fase (revisión de seguridad por fase, §11).

## Superficies y fronteras

1. Internet/red privada → API/UI
2. API → cola → workers
3. Workers → workspaces de IA/CI (contenedores)
4. Workspace → proveedor IA externo (única salida autorizada de datos)
5. Vault de secretos → harness (inyección just-in-time)
6. Plataforma → servidores del usuario (SSH/SFTP)
7. CD → entornos de despliegue
8. La plataforma a sí misma (BD, backups, actualizaciones)

## Amenazas por frontera (STRIDE)

### F1 — Internet → API/UI

| ID | Amenaza | Tipo | Control | Evidencia/Estado |
|---|---|---|---|---|
| T1.1 | Suplantación de usuario | S | Auth fuerte + sesiones firmadas; red privada/VPN, sin exposición a Internet en v1.0 (decisión 9) | Fase 1; puerta M1 |
| T1.2 | Escalada de rol (p. ej. desarrollador→admin) | E | Matriz denegado-por-defecto en código + tests por endpoint | [matriz-permisos](matriz-permisos.md) §coerción; Fase 1 |
| T1.3 | Manipulación de peticiones (IDOR a proyectos ajenos) | T | Todo recurso filtra por proyecto autorizado; test de acceso cruzado | Fase 1 |
| T1.4 | Repudio de acciones | R | `auditoria` append-only con actor y acción | modelo-datos §12 |
| T1.5 | DoS sobre API | D | Rate limiting + cola con backpressure | Fase 8 (plan §7); backlog P1 |
| T1.6 | Interceptación | I | HTTPS interno; sin secreto en URLs ni logs | CONSTRAINTS §1.2 |

### F2/F3 — Cola/workers → workspaces (código no confiable)

| ID | Amenaza | Tipo | Control | Evidencia/Estado |
|---|---|---|---|---|
| T3.1 | El código de la tarea lee fuera de su workspace | I/E | Contenedor: solo bind del workspace, `cap-drop ALL`, `no-new-privileges`, rootfs read-only | **S1 verificado** (ADR-0006): 10 pruebas |
| T3.2 | Exfiltración por red | I | `--network none` (o proxy de salida auditado cuando el proveedor lo exija) | **S1 verificado** |
| T3.3 | Ataque a otros proyectos/propios controles | E | Sin docker.sock; sin caps; usuario no-root (Fase 1) | S1 + condición ADR-0006 |
| T3.4 | Agotamiento de recursos del host | D | Límites memory/pids/CPU; OOM y fork-block verificados | **S1** (t8/t9) |
| T3.5 | Persistencia del trabajo tras reinicio inconsistente | T | Cola en PostgreSQL con re-entrega y estados reales | **S3 verificado** (ADR-0004) |

### F4 — Workspace → proveedor IA (única salida de datos)

| ID | Amenaza | Tipo | Control | Evidencia/Estado |
|---|---|---|---|---|
| T4.1 | Exfiltración de código/secretos al proveedor | I | Clasificación del proyecto (decisión 14): `local` no envía nada; exclusión de archivos sensibles; redacción de secretos antes de enviar | Fase 2; indicador "0 incidentes" (§14) |
| T4.2 | Inyección de instrucciones vía contenido del repo | T/E | Contenido tratado como no confiable; la IA no ejecuta instrucciones del contenido sin plan aprobado; hooks de política | §13; diseño E05; S4 (mecánica) |
| T4.3 | Cuota agotada deja tarea colgada | D | Failover con resumen de estado (mecánica verificada) | **S5 verificado** (ADR-0007) |
| T4.4 | Coste descontrolado | D(€) | Límites de gasto + alertas (decisión 11) | Fase 2 |

### F5 — Vault → harness

| ID | Amenaza | Tipo | Control | Evidencia/Estado |
|---|---|---|---|---|
| T5.1 | Volcado de BD revela secretos | I | Envelope encryption AES-256-GCM, clave maestra fuera de la BD | **S6 verificado** (ADR-0005): pg_dump + grep = 0 |
| T5.2 | La IA pide/ve valores de secretos | I | API de secretos no entrega valores a la capa IA; inyección just-in-time al proceso | matriz-permisos F5; Fase 1 |
| T5.3 | Secretos en logs/errores | I | Redacción obligatoria; escaneo en pipeline (gitleaks) | CONSTRAINTS §1.2; Fase 5 |
| T5.4 | Pérdida de la clave maestra | D | Clave incluida en backups cifrados aparte (decisión 15) + prueba de restauración | Fase 9 |

### F6 — Plataforma → servidores (SSH/SFTP)

| ID | Amenaza | Tipo | Control | Evidencia/Estado |
|---|---|---|---|---|
| T6.1 | Robo de credenciales de servidores | I | Credenciales por referencia (solo cifradas en BD); nunca inline ni en logs | S6 + modelo-datos §4 |
| T6.2 | Terminal usada sin autorización (usuario/servidor/acción) | E | Matriz por proyecto-servidor-acción; denegado por defecto | matriz-permisos; Fase 4 |
| T6.3 | Sesión maliciosa sin rastro | R | **Auditoría de sesiones P0** (v1.1) + registro de comandos | ADR v1.1 §18.2; Fase 4 |
| T6.4 | Comando destructivo accidentalmalicioso | T | Confirmación para comandos de riesgo; hooks de política; rollback documentado | Fase 4/6 |

### F7 — CD → entornos

| ID | Amenaza | Tipo | Control | Evidencia/Estado |
|---|---|---|---|---|
| T7.1 | Despliegue defectuoso marcado como exitoso | T | `exitoso` exige versión detectada == esperada **y** health verde (compromiso 2) | puerta Fase 6; modelo-datos §10 |
| T7.2 | Despliegue a producción sin humano | E | `aprobado_por` NOT NULL en producción (decisión 8); la IA excluida **siempre** | matriz-permisos; CONSTRAINTS §1.6 |
| T7.3 | Rollback incompatible con migraciones | T | Migraciones compatibles hacia atrás + backup previo | §13; Fase 6 |
| T7.4 | Artefacto manipulado entre CI y CD | T | Promoción por digest sha256; etiqueta+digest | modelo-datos §9; procedencia/firma P2 |

### F8 — La plataforma a sí misma

| ID | Amenaza | Tipo | Control | Evidencia/Estado |
|---|---|---|---|---|
| T8.1 | Pérdida de datos locales | D | Backups cifrados + restauración probada (decisión 15); cola persistente (S3) | Fase 9; puerta M6 |
| T8.2 | Actualización rompe instalación | T | Migraciones con vuelta atrás (Fase 9, puerta M6) | plan §7 Fase 9 |
| T8.3 | Auditoría alterada/borrada | R | Append-only (sin UPDATE/DELETE); retención 1 año | modelo-datos §12; Fase 8 |
| T8.4 | Bus factor / abandono | D | ADRs y documentación al día; alcance priorizado | §13 (añadido v1.1) |

## Cobertura de riesgos del plan (§13)

| Riesgo del plan | Amenazas | Evidencia actual |
|---|---|---|
| Aislamiento insuficiente | T3.1–T3.4 | S1 ✓ |
| IA con permisos excesivos / inyección | T4.2, T5.2, T6.4 | matriz + diseño E05 (S4 mecánica ✓) |
| Fuga de secretos | T5.1–T5.3, T4.1, T6.1 | S6 ✓ |
| Cuota agotada / coste | T4.3, T4.4 | S5 ✓ (mecánica) |
| Despliegue defectuoso = exitoso | T7.1 | diseño puerta Fase 6 |
| Exposición de la plataforma | T1.1 | decisión 9 (VPN) |
| Perder datos / rollback / auditoría | T8.1–T8.3, T7.3 | diseño; verificación en fases 6/9 |

## Riesgos residuales aceptados (con decisión explícita)

| Riesgo residual | Aceptación |
|---|---|
| Proveedor IA externo recibe contenido clasificado como `nube_con_exclusiones` | Compromiso del producto (decisión 14); el usuario elige por proyecto |
| Docker Desktop (rootful en utility VM) como runtime de la v1.0 instalada en Windows | Aceptado explícitamente para v1.0 (usuario administrador de su propia máquina; alcance personal/equipo pequeño — ADR-0011); rootless/Podman se exige en la instalación Linux futura (ADR-0006) |
| Rate limiting y firma de artefactos diferidos | P1/P2 del backlog; Fase 8/9 |
| Turnstile de comandos destructivos dependiente de heurísticas | Se prueba en Fase 4 con batería de comandos peligrosos |

## Método de revalidación

1. Cada fase re-ejecuta la **batería de aislamiento S1** como regresión (CONSTRAINTS §1.3).
2. Cada nueva frontera/feature añade sus filas aquí con control y evidencia.
3. La Fase 8 (M5) exige: no hay vulnerabilidades críticas conocidas sin decisión explícita documentada (puerta del plan).
