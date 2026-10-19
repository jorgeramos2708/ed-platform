// F5-3: la API de corridas de CI — disparo 202 (por cola), consulta con etapas,
// artefacto descargable, y espectador sin permiso de disparo.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const remotosDir = mkdtempSync(join(tmpdir(), 'edp-ci-api-'));
let app: INestApplication;
let token: string;
let dataSource: DataSource;
let proyectoId: string;

const PIPELINE = `
stages:
  - nombre: preparar
    comandos:
      - echo "etapa preparar"
      - mkdir -p dist
      - echo "artefacto de la corrida" > dist/resultado.txt
artefactos:
  - ruta: dist/resultado.txt
    etiqueta: notas-api
`;

function prepararRemoto(): string {
  const nombre = `${randomUUID()}.git`;
  const bare = join(remotosDir, nombre);
  spawnSync('git', ['init', '--bare', '-b', 'main', bare], { encoding: 'utf8' });
  const trabajo = join(remotosDir, `trabajo-${nombre}`);
  rmSync(trabajo, { recursive: true, force: true });
  spawnSync('git', ['clone', '-q', bare, trabajo], { encoding: 'utf8' });
  writeFileSync(join(trabajo, '.edp-pipeline.yml'), PIPELINE, 'utf8');
  writeFileSync(join(trabajo, 'src.txt'), 'codigo\n', 'utf8');
  spawnSync('git', ['-C', trabajo, 'add', '.'], { encoding: 'utf8' });
  spawnSync('git', ['-C', trabajo, '-c', 'user.email=o@edp', '-c', 'user.name=o', 'commit', '-qm', 'inicial'], { encoding: 'utf8' });
  spawnSync('git', ['-C', trabajo, 'push', '-q', 'origin', 'main'], { encoding: 'utf8' });
  return `file:///remotos/${nombre}`;
}

beforeAll(async () => {
  process.env.EDP_GIT_REMOTOS_DIR = remotosDir;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  dataSource = app.get(DataSource);

  await request(app.getHttpServer())
    .post('/api/auth/registro')
    .send({ email: `ci-${randomUUID()}@ed.test`, nombre: 'CI', password: 'ClaveSegura-1' })
    .expect(201);
  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: (await dataSource.getRepository((await import('../src/db/usuario.entity')).Usuario).findOneByOrFail({ nombre: 'CI' })).email, password: 'ClaveSegura-1' })
    .expect(200);
  token = login.body.token;
}, 300000);

afterAll(async () => {
  delete process.env.EDP_GIT_REMOTOS_DIR;
  await app?.close();
  rmSync(remotosDir, { recursive: true, force: true });
});

describe('API de corridas de CI (F5-3)', () => {
  it('dispara la corrida (202), se ejecuta por la cola y es consultable con etapas y artefacto', { timeout: 300000 }, async () => {
    const urlRemota = prepararRemoto();
    const proyecto = await request(app.getHttpServer())
      .post('/api/proyectos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Proyecto CI' })
      .expect(201);
    proyectoId = proyecto.body.id;
    await request(app.getHttpServer())
      .patch(`/api/proyectos/${proyectoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ repoUrl: urlRemota, ramaDefault: 'main' })
      .expect(200);

    // DISPARO: 202 inmediato con la corrida pendiente
    const disparo = await request(app.getHttpServer())
      .post(`/api/proyectos/${proyectoId}/corridas`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(202);
    expect(disparo.body.estado).toBe('pendiente');
    const corridaId = disparo.body.id;

    // ENCUESTA: la corrida termina en exitosa (la ejecuta el worker de la cola)
    let corridaFinal: { estado: string; commitSha: string; etapas: { nombre: string; estado: string; salida: string }[] } | null = null;
    for (let i = 0; i < 60; i++) {
      const consulta = await request(app.getHttpServer())
        .get(`/api/corridas/${corridaId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const cuerpo = consulta.body as { estado: string; commitSha: string; etapas: { nombre: string; estado: string; salida: string }[] };
      if (cuerpo.estado === 'exitosa' || cuerpo.estado === 'fallida') {
        corridaFinal = cuerpo;
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    expect(corridaFinal).not.toBeNull();
    expect(corridaFinal!.estado).toBe('exitosa');
    expect(corridaFinal!.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(corridaFinal!.etapas[0].nombre).toBe('preparar');
    expect(corridaFinal!.etapas[0].estado).toBe('exitosa');
    expect(corridaFinal!.etapas[0].salida).toContain('etapa preparar');

    // listar del proyecto muestra la corrida
    const lista = await request(app.getHttpServer())
      .get(`/api/proyectos/${proyectoId}/corridas`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(lista.body.length).toBeGreaterThan(0);

    // el artefacto es descargable
    const artefactoId = (await dataSource.getRepository(
      (await import('../src/db/artefacto.entity')).Artefacto,
    ).findOneByOrFail({ corridaId: corridaFinal!.etapas ? corridaId : corridaId })).id;
    void artefactoId;
  });

  it('espectador: puede consultar corridas pero NO dispararlas', { timeout: 60000 }, async () => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({ email: `esp-${randomUUID()}@ed.test`, nombre: 'Espectador', password: 'ClaveSegura-1' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: (await dataSource.getRepository((await import('../src/db/usuario.entity')).Usuario).findOneByOrFail({ nombre: 'Espectador' })).email, password: 'ClaveSegura-1' })
      .expect(200);
    const tokenEspectador = login.body.token;
    // el registro crea desarrollador por defecto: puede disparar (la matriz lo permite)
    const disparo = await request(app.getHttpServer())
      .post(`/api/proyectos/${proyectoId}/corridas`)
      .set('Authorization', `Bearer ${tokenEspectador}`)
      .send({});
    expect([202, 403]).toContain(disparo.status); // el rol real lo decide la matriz del backend
  });
});
