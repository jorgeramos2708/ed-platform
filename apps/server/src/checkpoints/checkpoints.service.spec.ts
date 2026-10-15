// RED: checkpoints y rewind exactos (S4) sobre el workspace real — la base del aceptar/descartar de M2
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CheckpointsService } from './checkpoints.service';

const proyectoId = randomUUID();
const workspaces = new WorkspacesService();
const checkpoints = new CheckpointsService(workspaces);

beforeAll(async () => {
  await workspaces.asegurarImagenBase();
}, 240000);

describe('CheckpointsService — capturar, diff y rewind exacto', () => {
  it('checkpoint captura el estado y devuelve hash + diff de los cambios', { timeout: 90000 }, async () => {
    const ws = await workspaces.crear(proyectoId);
    await workspaces.ejecutar(proyectoId, ws.id, 'echo v1 > app.txt');
    const cp = await checkpoints.crear(proyectoId, ws.id, 'primera versión');
    expect(cp.hash).toMatch(/^[0-9a-f]{40}$/);
    expect(cp.diff).toContain('+v1'); // primer commit: diff contra el árbol vacío
  });

  it('rewind exacto: vuelve byte a byte, limpia huérfanos y deja HEAD en el checkpoint', { timeout: 90000 }, async () => {
    const ws = await workspaces.crear(proyectoId);
    await workspaces.ejecutar(proyectoId, ws.id, 'echo v1 > app.txt');
    const inicial = await checkpoints.crear(proyectoId, ws.id, 'inicial');

    await workspaces.ejecutar(proyectoId, ws.id, 'echo v2-roto > app.txt && echo extra > huérfano.txt');
    const diff = await checkpoints.diffPendiente(proyectoId, ws.id); // working tree vs checkpoint
    expect(diff).toContain('v2-roto'); // los cambios tracked aparecen en el diff
    // huérfano.txt no aparece: git diff no lista sin-seguimiento; su limpieza se verifica abajo

    const resultado = await checkpoints.rewind(proyectoId, ws.id, inicial.hash);
    expect(resultado.head).toBe(inicial.hash);
    expect(resultado.limpio).toBe(true);

    const cat = await workspaces.ejecutar(proyectoId, ws.id, 'cat app.txt');
    expect(cat.salida).toContain('v1'); // contenido exacto de la versión previa
    const hueso = await workspaces.ejecutar(proyectoId, ws.id, 'ls huérfano.txt');
    expect(hueso.codigo).not.toBe(0); // git clean eliminó el archivo huérfano
  });

  it('diff entre dos checkpoints muestra solo lo cambiado entre ellos', { timeout: 90000 }, async () => {
    const ws = await workspaces.crear(proyectoId);
    await workspaces.ejecutar(proyectoId, ws.id, 'echo uno > a.txt');
    const cp1 = await checkpoints.crear(proyectoId, ws.id, 'uno');
    await workspaces.ejecutar(proyectoId, ws.id, 'echo dos > b.txt');
    const cp2 = await checkpoints.crear(proyectoId, ws.id, 'dos');
    const diff = await checkpoints.diff(proyectoId, ws.id, cp1.hash, cp2.hash);
    expect(diff).toContain('b.txt');
    expect(diff).not.toContain('a.txt');
  });
});
