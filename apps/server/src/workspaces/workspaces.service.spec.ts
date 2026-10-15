// RED: workspaces aislados — la batería S1 como PRUEBA DE REGRESIÓN permanente (CONSTRAINTS §1.3, ADR-0006)
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { WorkspacesService } from './workspaces.service';

const proyectoId = randomUUID();
const service = new WorkspacesService();

beforeAll(async () => {
  await service.asegurarImagenBase();
}, 240000); // la primera construcción de la imagen base tarda más que el timeout global

describe('WorkspacesService — contenedores de tarea confinados', () => {
  it('crea un workspace (directorio + git init) y ejecuta un comando dentro', { timeout: 90000 }, async () => {
    const ws = await service.crear(proyectoId);
    expect(ws.id).toBeDefined();
    const r = await service.ejecutar(proyectoId, ws.id, 'echo hola-desde-el-workspace');
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain('hola-desde-el-workspace');
  });

  it('los archivos persisten entre comandos (mismo workspace)', { timeout: 90000 }, async () => {
    const ws = await service.crear(proyectoId);
    await service.ejecutar(proyectoId, ws.id, 'echo contenido-persistente > nota.txt');
    const r = await service.ejecutar(proyectoId, ws.id, 'cat nota.txt');
    expect(r.salida).toContain('contenido-persistente');
  });

  it('BATERÍA S1 (regresión permanente): sin escritura fuera, sin red, sin caps, workspace escribible', { timeout: 90000 }, async () => {
    const ws = await service.crear(proyectoId);
    const r = await service.ejecutar(proyectoId, ws.id, [
      'touch /intento-escritura 2>/dev/null && echo "FALLO:rootfs-escribible" || echo "OK:rootfs-ro"',
      'wget -T 2 -q -O /dev/null http://example.com 2>/dev/null && echo "FALLO:con-red" || echo "OK:sin-red"',
      'ls /var/run/docker.sock 2>/dev/null && echo "FALLO:con-socket" || echo "OK:sin-socket"',
      'grep -q "^CapEff:[[:space:]]*0000000000000000$" /proc/self/status && echo "OK:sin-caps" || echo "FALLO:con-caps"',
      'echo trabajo > /workspace/marcador.txt && echo "OK:workspace-escribible"',
    ].join(' && ') + ' ; true');
    expect(r.salida).toContain('OK:rootfs-ro');
    expect(r.salida).toContain('OK:sin-red');
    expect(r.salida).toContain('OK:sin-socket');
    expect(r.salida).toContain('OK:sin-caps');
    expect(r.salida).toContain('OK:workspace-escribible');
    expect(r.salida).not.toContain('FALLO:');
  });

  it('límites de recursos aplicados: la memoria se agota (OOM) si el trabajo la excede', { timeout: 90000 }, async () => {
    const ws = await service.crear(proyectoId);
    // retener 200MB con límite de 64MB -> OOMKilled (código 137)
    const r = await service.ejecutar(
      proyectoId,
      ws.id,
      'A=$(dd if=/dev/zero bs=1M count=200 2>/dev/null | base64 -w0); echo ${#A}',
    );
    expect([137, 139]).toContain(r.codigo); // OOMKill o fallo de asignación
  });
});
