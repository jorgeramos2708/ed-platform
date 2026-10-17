// e2e de la PUERTA de la Fase 3 (a nivel API, con remoto bare local en modo pruebas):
// un cambio de la IA se revisa (diff), se confirma en un commit y se sincroniza (push)
// sin perder trabajo — incluido el camino del conflicto.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CADENA_PROVEEDORES } from '../src/harness/proveedor-ia';
import { ProveedorMock } from '../src/harness/mock/proveedor-mock';

const remotosDir = mkdtempSync(join(tmpdir(), 'edp-puerta-git-'));
const remotosHost = (url: string) => url.replace('file:///remotos', remotosDir);

function planJson(pasos: unknown[]): string {
  return '```json\n' + JSON.stringify({ titulo: 'cambio de la IA', pasos }) + '\n```';
}

let app: INestApplication;
let token: string;
let dataSource: DataSource;

beforeAll(async () => {
  process.env.EDP_GIT_REMOTOS_DIR = remotosDir;
  const mock = new ProveedorMock('mock', [
    planJson([
      {
        accion: 'editar',
        archivo: 'cambio-ia.txt',
        contenido: 'cambio generado por la IA para la puerta\n',
      },
    ]),
    planJson([
      {
        accion: 'editar',
        archivo: 'cambio-ia-2.txt',
        contenido: 'segundo cambio de la IA\n',
      },
    ]),
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
  await dataSource.query('TRUNCATE proyectos, usuarios, secretos, auditoria, trabajos, gasto_ia RESTART IDENTITY CASCADE');
  await request(app.getHttpServer())
    .post('/api/auth/registro')
    .send({ email: 'dev@ed.test', nombre: 'Dev', password: 'ClaveSegura-1' })
    .expect(201);
  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: 'dev@ed.test', password: 'ClaveSegura-1' })
    .expect(200);
  token = login.body.token;
});

afterAll(async () => {
  delete process.env.EDP_GIT_REMOTOS_DIR;
  await app?.close();
  rmSync(remotosDir, { recursive: true, force: true });
});

describe('Puerta Fase 3 — cambio de la IA revisado, confirmado y sincronizado', () => {

  it('flujo completo: clon → cambio de la IA (diff) → commit → push → sincronizado en clon fresco', { timeout: 180000 }, async () => {
    // 1. origen con un commit semilla
    const nombreRemoto = `${randomUUID()}.git`;
    const urlRemota = `file:///remotos/${nombreRemoto}`;
    const rutaBare = join(remotosDir, nombreRemoto);
    spawnSync('git', ['init', '--bare', '-b', 'main', rutaBare], { encoding: 'utf8' });
    const semilla = join(remotosDir, 'semilla');
    rmSync(semilla, { recursive: true, force: true });
    spawnSync('git', ['clone', '-q', rutaBare, semilla], { encoding: 'utf8' });
    writeFileSync(join(semilla, 'base.txt'), 'base del proyecto\n', 'utf8');
    spawnSync('git', ['-C', semilla, 'add', '.'], { encoding: 'utf8' });
    spawnSync('git', ['-C', semilla, '-c', 'user.email=o@edp', '-c', 'user.name=o', 'commit', '-qm', 'base'], { encoding: 'utf8' });
    spawnSync('git', ['-C', semilla, 'push', '-q', 'origin', 'main'], { encoding: 'utf8' });

    // 2. proyecto con remoto + workspace que nace CLONADO
    const proyecto = await request(app.getHttpServer())
      .post('/api/proyectos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Puerta Git' })
      .expect(201);
    const pid = proyecto.body.id;
    await request(app.getHttpServer())
      .patch(`/api/proyectos/${pid}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ repoUrl: urlRemota, ramaDefault: 'main' })
      .expect(200);
    const ws = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(ws.body.clonado).toBe(true);
    const base = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/workspaces/${ws.body.id}/comandos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ comando: 'cat base.txt' })
      .expect(201);
    expect(base.body.salida).toContain('base del proyecto');

    // 3. cambio de la IA: plan → ejecutar (commits en el workspace) → revisión del diff
    const plan = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/harness/plan`)
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId: ws.body.id, instruccion: 'agrega cambio-ia.txt' })
      .expect(201);
    expect(plan.body.proveedor).toBe('mock');
    const ejecucion = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/harness/ejecutar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId: ws.body.id, plan: plan.body.plan })
      .expect(201);
    expect(ejecucion.body.diff).toContain('cambio generado por la IA');

    // 4. push: el cambio se sincroniza
    const push = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/workspaces/${ws.body.id}/push`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(push.body.rechazado).toBe(false);

    // 5. sincronizado verificado: un workspace FRESCO recibe el cambio de la IA
    const ws2 = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const verificacion = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/workspaces/${ws2.body.id}/comandos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ comando: 'cat cambio-ia.txt' })
      .expect(201);
    expect(verificacion.body.salida).toContain('cambio generado por la IA');

    // 6. historial visible
    const historial = await request(app.getHttpServer())
      .get(`/api/proyectos/${pid}/workspaces/${ws.body.id}/historial`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(JSON.stringify(historial.body)).toContain('cambio de la IA');
  });

  it('conflicto vía API: push rechazado, pull informa conflicto y el trabajo local NO se pierde', { timeout: 180000 }, async () => {
    const nombreRemoto = `${randomUUID()}.git`;
    const urlRemota = `file:///remotos/${nombreRemoto}`;
    const rutaBare = join(remotosDir, nombreRemoto);
    spawnSync('git', ['init', '--bare', '-b', 'main', rutaBare], { encoding: 'utf8' });
    const semilla = join(remotosDir, 'semilla-conf');
    rmSync(semilla, { recursive: true, force: true });
    spawnSync('git', ['clone', '-q', rutaBare, semilla], { encoding: 'utf8' });
    writeFileSync(join(semilla, 'compartido.txt'), 'original\n', 'utf8');
    spawnSync('git', ['-C', semilla, 'add', '.'], { encoding: 'utf8' });
    spawnSync('git', ['-C', semilla, '-c', 'user.email=o@edp', '-c', 'user.name=o', 'commit', '-qm', 'base'], { encoding: 'utf8' });
    spawnSync('git', ['-C', semilla, 'push', '-q', 'origin', 'main'], { encoding: 'utf8' });

    const proyecto = await request(app.getHttpServer())
      .post('/api/proyectos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Puerta Git Conflicto' })
      .expect(201);
    const pid = proyecto.body.id;
    await request(app.getHttpServer())
      .patch(`/api/proyectos/${pid}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ repoUrl: urlRemota, ramaDefault: 'main' })
      .expect(200);
    const ws = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    // el remoto avanza tocando compartido.txt (espejo en el host)
    const espejo = join(remotosDir, 'espejo-puerta');
    rmSync(espejo, { recursive: true, force: true });
    spawnSync('git', ['clone', '-q', rutaBare, espejo], { encoding: 'utf8' });
    writeFileSync(join(espejo, 'compartido.txt'), 'versión del remoto\n', 'utf8');
    spawnSync('git', ['-C', espejo, 'add', '.'], { encoding: 'utf8' });
    spawnSync('git', ['-C', espejo, '-c', 'user.email=o@edp', '-c', 'user.name=o', 'commit', '-qm', 'remoto toca compartido'], { encoding: 'utf8' });
    spawnSync('git', ['-C', espejo, 'push', '-q'], { encoding: 'utf8' });

    // la IA toca el MISMO archivo localmente
    const plan = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/harness/plan`)
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId: ws.body.id, instruccion: 'toca compartido.txt' })
      .expect(201);
    const planLocal = {
      ...plan.body.plan,
      pasos: [{ accion: 'editar', archivo: 'compartido.txt', contenido: 'versión de la IA\n' }],
    };
    await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/harness/ejecutar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId: ws.body.id, plan: planLocal })
      .expect(201);

    // push rechazado (no-fast-forward)
    const push = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/workspaces/${ws.body.id}/push`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(push.body.rechazado).toBe(true);

    // pull informa el conflicto y el trabajo local queda intacto
    const pull = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/workspaces/${ws.body.id}/pull`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(pull.body.conflicto).toBe(true);
    expect(pull.body.archivosConflicto).toContain('compartido.txt');
    const contenido = await request(app.getHttpServer())
      .post(`/api/proyectos/${pid}/workspaces/${ws.body.id}/comandos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ comando: 'cat compartido.txt' })
      .expect(201);
    expect(contenido.body.salida).toContain('versión de la IA');
  });
});
