#!/bin/sh
# Batería de aislamiento para el spike S1 (corre dentro del contenedor confinado)
echo "== t1 caps efectivos (esperado 0000000000000000 tras --cap-drop ALL) =="
grep CapEff /proc/self/status

echo "== t2 montajes visibles (solo el workspace de la tarea debe estar montado) =="
cat /proc/mounts | grep -vE "proc|sysfs|tmpfs|devpts|mqueue|cgroup|overlay / |overlay /etc"

echo "== t3 sanity: ruta del host no montada (debe no existir) =="
ls /secreto-fuera.txt 2>&1 || echo "OK: no visible"

echo "== t4 escribir en / (read-only rootfs, debe fallar) =="
touch /intento-escritura 2>&1 || echo "OK: rootfs read-only"

echo "== t5 escribir en /workspace (debe funcionar: es el area de la tarea) =="
echo "trabajo-dentro-del-workspace" >> /workspace/tarea.txt && echo "OK: workspace accesible"

echo "== t6 socket de Docker (debe no existir) =="
ls /var/run/docker.sock 2>&1 || echo "OK: sin socket de Docker"

echo "== t7 red (--network none, debe fallar) =="
wget -T 2 -q -O /dev/null http://example.com 2>&1 || echo "OK: sin red"
