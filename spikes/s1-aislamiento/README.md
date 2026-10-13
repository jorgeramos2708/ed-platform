# Spike S1 — Aislamiento de runners

**Pregunta (plan §6.1):** ¿Qué nivel de aislamiento ofrece la contención de contenedores con límites de recursos y red restringida?
**Criterio de éxito:** una tarea no puede leer fuera de su workspace ni acceder a otros proyectos.
**Veredicto: PASA** (mecanismo verificado; producción en Linux rootless/Podman — ver ADR-0006).

## Comandos (PowerShell, Docker Desktop)

```powershell
# Batería principal: contención + red none + rootfs read-only + límites
docker run --rm --name edp-s1-job `
  --network none `
  --cap-drop ALL --security-opt no-new-privileges `
  --read-only --tmpfs /tmp:rw,size=16m `
  --pids-limit 32 --memory 128m `
  -v "<workspace>:/workspace" `
  alpine:3.20 sh /workspace/test.sh

# Verificación del alcance real del bind mount (solo el subárbol del workspace)
docker run --rm --network none --cap-drop ALL -v "<workspace>:/workspace" alpine:3.20 `
  sh -c "ls -la /workspace; find /workspace -name 'secreto-fuera.txt' | wc -l; ls /workspace/Windows"

# Límite de memoria: retener 200 MB con --memory 64m (esperado OOMKilled 137)
docker run --rm --memory 64m alpine:3.20 sh -c "A=`$(dd if=/dev/zero bs=1M count=200 2>/dev/null | base64 -w0); echo `${#A}"

# Límite de pids: 50 forks con --pids-limit 16 (esperado: fork bloqueado)
docker run --rm --pids-limit 16 alpine:3.20 sh -c "for i in $(seq 1 40); do sleep 1 & done; sleep 1"
```

## Resultados (12-13 oct. 2026, Docker 29.8.1 / Docker Desktop WSL2)

| Test | Resultado |
|---|---|
| t1 Caps efectivos tras `--cap-drop ALL` | `CapEff: 0000000000000000` ✓ |
| t2 Montajes visibles | Solo `/workspace` + `/etc/{hostname,hosts,resolv.conf}` ✓ |
| t2-bis Alcance del bind (por contenido) | Solo el subárbol del workspace: sin `Proyectos-IA`, sin `Windows`, `secreto-fuera.txt` = 0 hallazgos ✓ |
| t3 Ruta del host no montada | No visible ✓ |
| t4 Escritura en `/` | `Read-only file system` ✓ |
| t5 Escritura en `/workspace` | OK (área de la tarea) ✓ |
| t6 Socket de Docker | Ausente ✓ |
| t7 Red (`--network none`) | `bad address` — sin salida ✓ |
| t8 Memoria 64 MB | `exit 137` (OOMKilled) al retener 200 MB ✓ |
| t9 Pids 16 | `can't fork: Resource temporarily unavailable` al exceder ✓ |

## Notas

- La línea 9p `path=C:\` de `/proc/mounts` es el *share* interno del driver de Windows de Docker Desktop, **no** el alcance expuesto: lo demuestra t2-bis por contenido.
- OOM solo ocurre si la memoria se **retiene** (asignación en variable); procesos que hacen streaming en tubería pueden no superarla — lección para las pruebas de carga de la Fase 1.
