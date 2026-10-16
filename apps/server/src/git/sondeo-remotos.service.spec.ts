// RED: F3-4 — sondeo del remoto: detecta avances del origen (ls-remote) y los audita
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { Proyecto } from '../db/proyecto.entity';
import { Auditoria } from '../db/auditoria.entity';
import { GitService } from './git.service';
import { SondeoRemotosService } from './sondeo-remotos.service';

const remotosDir = mkdtempSync(join(tmpdir(), 'edp-sondeo-'));
let dataSource: DataSource;
let sondeo: SondeoRemotosService;

function prepararOrigenConCommits(n: number): { url: string; ultimoHash: string } {
  const nombre = `${randomUUID()}.git`;
  const rutaBare = join(remotosDir, nombre);
  spawnSync('git', ['init', '--bare', '-b', 'main', rutaBare], { encoding: 'utf8' });
  const trabajo = join(remotosDir, `trabajo-${nombre}`);
  rmSync(trabajo, { recursive: true, force: true });
  spawnSync('git', ['clone', '-q', rutaBare, trabajo], { encoding: 'utf8' });
  let hash = '';
  for (let i = 1; i <= n; i++) {
    writeFileSync(join(trabajo, `nota-${i}.txt`), `nota ${i}\n`, 'utf8');
    spawnSync('git', ['-C', trabajo, 'add', '.'], { encoding: 'utf8' });
    spawnSync('git', ['-C', trabajo, '-c', 'user.email=o@edp', '-c', 'user.name=o', 'commit', '-qm', `nota ${i}`], { encoding: 'utf8' });
  }
  spawnSync('git', ['-C', trabajo, 'push', '-q', 'origin', 'main'], { encoding: 'utf8' });
  const log = spawnSync('git', ['-C', trabajo, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  hash = log.stdout.trim();
  return { url: `file:///remotos/${nombre}`, ultimoHash: hash };
}

beforeAll(async () => {
  process.env.EDP_GIT_REMOTOS_DIR = remotosDir;
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env.DATABASE_URL ?? 'postgres://edp:edp_dev@localhost:5433/edp',
        entities: [Proyecto, Auditoria],
        synchronize: true, // solo este spec: el sondeo v1 usa remoto_head (migración 0004 aparte)
      }),
      TypeOrmModule.forFeature([Proyecto, Auditoria]),
    ],
    providers: [WorkspacesService, GitService, SondeoRemotosService],
  }).compile();
  sondeo = moduleRef.get(SondeoRemotosService);
  dataSource = moduleRef.get(DataSource);
  await moduleRef.get(WorkspacesService).asegurarImagenBase();
}, 240000);

afterAll(() => {
  delete process.env.EDP_GIT_REMOTOS_DIR;
  rmSync(remotosDir, { recursive: true, force: true });
});

describe('SondeoRemotosService (F3-4)', () => {
  beforeEach(async () => {
    await dataSource.query('TRUNCATE proyectos, auditoria RESTART IDENTITY CASCADE');
  });

  it('detecta el avance del origen, actualiza remoto_head y audita', { timeout: 120000 }, async () => {
    const { url, ultimoHash } = prepararOrigenConCommits(2);
    const repo = dataSource.getRepository(Proyecto);
    const p = await repo.save(repo.create({ nombre: 'Sondeado', slug: 'sondeado', repoUrl: url, remotoHead: null }));
    const r = await sondeo.verificarRemoto(p.id);
    expect(r.cambio).toBe(true);
    expect(r.hashNuevo).toBe(ultimoHash);
    const actualizado = await repo.findOneByOrFail({ id: p.id });
    expect(actualizado.remotoHead).toBe(ultimoHash);
    const audit = await dataSource.getRepository(Auditoria).findOneByOrFail({ accion: 'proyecto.remoto.avance' });
    expect(audit.recursoId).toBe(p.id);
  });

  it('sin cambios en el origen: sin auditoría de avance', { timeout: 120000 }, async () => {
    const { url, ultimoHash } = prepararOrigenConCommits(1);
    const repo = dataSource.getRepository(Proyecto);
    const p = await repo.save(repo.create({ nombre: 'Estable', slug: 'estable', repoUrl: url, remotoHead: ultimoHash }));
    const r = await sondeo.verificarRemoto(p.id);
    expect(r.cambio).toBe(false);
    const avances = await dataSource.getRepository(Auditoria).findBy({ accion: 'proyecto.remoto.avance' });
    expect(avances).toHaveLength(0);
  });

  it('proyecto sin remoto: se salta sin error', { timeout: 60000 }, async () => {
    const repo = dataSource.getRepository(Proyecto);
    const p = await repo.save(repo.create({ nombre: 'Local', slug: 'local' }));
    const r = await sondeo.verificarRemoto(p.id);
    expect(r.cambio).toBe(false);
  });

  it('procesarTodos sondea todos los proyectos con remoto', { timeout: 120000 }, async () => {
    const a = prepararOrigenConCommits(1);
    const repo = dataSource.getRepository(Proyecto);
    await repo.save(repo.create({ nombre: 'Varios A', slug: 'varios-a', repoUrl: a.url, remotoHead: a.ultimoHash }));
    const sinRemoto = await repo.save(repo.create({ nombre: 'Varios B', slug: 'varios-b' }));
    const resumen = await sondeo.procesarTodos();
    expect(resumen.sondeados).toBe(1); // solo los que tienen remoto
    expect(resumen.saltados).toBe(1);
  });
});
