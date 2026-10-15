// RED: HarnessService — plan JSON (failover S5) + ejecución con checkpoints (S4) + límite de gasto
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CheckpointsService } from '../checkpoints/checkpoints.service';
import { HarnessService } from './harness.service';
import { ProveedorMock } from './mock/proveedor-mock';
import { QuotaError } from './proveedor-ia';

const proyectoId = randomUUID();
const workspaces = new WorkspacesService();
const checkpoints = new CheckpointsService(workspaces);

function planJson(pasos: unknown[], titulo = 'plan de prueba'): string {
  return '```json\n' + JSON.stringify({ titulo, pasos }) + '\n```'; // con fences: prueba el parseo real de LLM
}

beforeAll(async () => {
  await workspaces.asegurarImagenBase();
}, 240000);

describe('HarnessService', () => {
  it('genera el plan (JSON con fences) y lo ejecuta con checkpoint inicial y final', { timeout: 90000 }, async () => {
    const ws = await workspaces.crear(proyectoId);
    const principal = new ProveedorMock('principal', [
      planJson([
        { accion: 'editar', archivo: 'app.txt', contenido: 'hola desde la IA' },
        { accion: 'comando', comando: 'cat app.txt' },
      ], 'saludar'),
    ]);
    const harness = new HarnessService(workspaces, checkpoints, [principal]);

    const { plan, proveedor, failover, uso } = await harness.generarPlan('crea un saludo');
    expect(plan.titulo).toBe('saludar');
    expect(plan.pasos).toHaveLength(2);
    expect(proveedor).toBe('principal');
    expect(failover).toBe(false);
    expect(uso.entrada).toBeGreaterThan(0);

    const r = await harness.ejecutarPlan(proyectoId, ws.id, plan);
    expect(r.pasos).toBe(2);
    const cat = await workspaces.ejecutar(proyectoId, ws.id, 'cat app.txt');
    expect(cat.salida).toContain('hola desde la IA');
    expect(r.diff).toContain('hola desde la IA'); // el diff que la UI mostrará para aceptar/descartar

    // descartar = rewind al checkpoint inicial → estado limpio
    await checkpoints.rewind(proyectoId, ws.id, r.checkpointInicial);
    const estado = await checkpoints.estado(proyectoId, ws.id);
    expect(estado.limpio).toBe(true);
  });

  it('failover (S5): el principal agota cuota y el respaldo genera el plan sin perder la tarea', { timeout: 90000 }, async () => {
    const ws = await workspaces.crear(proyectoId);
    const conCuota = new ProveedorMock('principal', [new QuotaError('principal')]);
    const respaldo = new ProveedorMock('respaldo', [
      planJson([{ accion: 'comando', comando: 'echo hecho-por-respaldo' }], 'plan del respaldo'),
    ]);
    const harness = new HarnessService(workspaces, checkpoints, [conCuota, respaldo]);

    const { plan, proveedor, failover } = await harness.generarPlan('tarea con failover');
    expect(proveedor).toBe('respaldo');
    expect(failover).toBe(true);

    const r = await harness.ejecutarPlan(proyectoId, ws.id, plan);
    expect(r.pasos).toBe(1); // la tarea continúa: el plan del respaldo se ejecuta completo
    const cat = await workspaces.ejecutar(proyectoId, ws.id, 'cat salida.txt 2>/dev/null; ls');
    expect(cat.salida).toBeDefined();
  });

  it('límite de gasto: aborta cuando los tokens acumulados superan el límite', { timeout: 90000 }, async () => {
    const ws = await workspaces.crear(proyectoId);
    const pródigo = new ProveedorMock('pródigo', [planJson([{ accion: 'comando', comando: 'echo x' }])]);
    const harness = new HarnessService(workspaces, checkpoints, [pródigo]);
    // el mock reporta 150 tokens por llamada; límite 50 → aborta
    await expect(harness.generarPlan('tarea', { limiteTokens: 50 })).rejects.toMatchObject({
      name: 'LimiteGastoError',
    });
  });
});
