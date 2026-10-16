// RED: F2-4 API del harness — workspace, plan (503 sin proveedor / plan con mock), ejecutar, descartar, chat
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { CADENA_PROVEEDORES } from '../src/harness/proveedor-ia';
import { ProveedorIA } from '../src/harness/proveedor-ia';
import { ProveedorMock } from '../src/harness/mock/proveedor-mock';

function planJson(pasos: unknown[]): string {
  return '```json\n' + JSON.stringify({ titulo: 'plan e2e', pasos }) + '\n```';
}

describe('Harness API (e2e, plan antes de ejecutar)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let pid: string;
  const proyectoId = 'e2e-harness';

  beforeAll(async () => {
    const mock: ProveedorIA = new ProveedorMock('mock', [
      planJson([{ accion: 'comando', comando: 'echo generado-por-ia > salida-ia.txt' }]),
      planJson([{ accion: 'comando', comando: 'echo plan-2' }]),
      planJson([{ accion: 'comando', comando: 'echo plan-3' }]),
      planJson([{ accion: 'comando', comando: 'echo plan-4' }]),
      planJson([{ accion: 'comando', comando: 'echo plan-5' }]),
    ]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CADENA_PROVEEDORES)
      .useValue([mock])
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE proyectos, usuarios, secretos, auditoria, trabajos RESTART IDENTITY CASCADE');
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({ email: 'dev@ed.test', nombre: 'Dev', password: 'ClaveSegura-1' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'dev@ed.test', password: 'ClaveSegura-1' })
      .expect(200);
    token = login.body.token;
    const proyecto = await request(app.getHttpServer())
      .post('/api/proyectos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: proyectoId })
      .expect(201);
    pid = proyecto.body.id as string;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('crea un workspace aislado para el proyecto', { timeout: 90000 }, async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(res.body.id).toBeDefined();
  });

  it('plan → ejecutar → diff con contenido; luego descartar → estado limpio', { timeout: 90000 }, async () => {
    const ws = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const wsId = ws.body.id as string;

    const plan = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/harness/plan`)
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId: wsId, instruccion: 'crea salida-ia.txt' })
      .expect(201);
    expect(plan.body.plan.pasos.length).toBeGreaterThan(0);
    expect(plan.body.proveedor).toBe('mock');

    const ejecucion = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/harness/ejecutar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId: wsId, plan: plan.body.plan })
      .expect(201);
    expect(ejecucion.body.diff).toContain('generado-por-ia');

    // descartar = rewind exacto al checkpoint inicial (S4)
    await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/harness/descartar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId: wsId, checkpointInicial: ejecucion.body.checkpointInicial })
      .expect(200);
    const estado = await request(app.getHttpServer())
      .get(`/api/proyectos/${pid}/workspaces/${wsId}/estado`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(estado.body.limpio).toBe(true);
  });

  it('chat por proyecto responde con el proveedor configurado', { timeout: 90000 }, async () => {
    const ws = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const res = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/harness/chat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mensajes: [{ rol: 'user', contenido: '¿cómo está el proyecto?' }] })
      .expect(201);
    expect(res.body.respuesta).toContain('plan e2e'); // el mock responde con su plan scripted
  });

  it('sin proveedores configurados → 503 (arranque sin key es válido)', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const appSinProveedor = moduleRef.createNestApplication();
    await appSinProveedor.init();
    // sin override: la cadena por env está vacía (no hay EDP_AI_API_KEY en la suite)
    await request(appSinProveedor.getHttpServer())
      .post('/api/auth/registro')
      .send({ email: 'x@ed.test', nombre: 'X', password: 'ClaveSegura-1' })
      .expect(201);
    const login = await request(appSinProveedor.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'x@ed.test', password: 'ClaveSegura-1' })
      .expect(200);
    await request(appSinProveedor.getHttpServer())
      .post('/api/proyectos')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ nombre: 'SinProveedor' })
      .expect(201);
    await request(appSinProveedor.getHttpServer())
      .post('/api/proyectos/SinProveedor/harness/plan')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ workspaceId: 'no-importa', instruccion: 'x' })
      .expect(503);
    await appSinProveedor.close();
  });
});
