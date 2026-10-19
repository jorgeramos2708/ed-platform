// F5-2: el EJECUTOR de CI — un pipeline del repositorio corre en un workspace aislado
// (clon del commit), etapas secuenciales con logs, y artefactos con digest.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CiService } from './ci.service';
import { PipelineService } from './pipeline.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { GitService } from '../git/git.service';
import { SecretosService } from '../secretos/secretos.service';
import { CifradorService } from '../secretos/cifrador.service';
import { SanitizadorService } from '../secretos/sanitizador.service';
import { ProyectosService } from '../proyectos/proyectos.service';
import { ServidoresService } from '../servidores/servidores.service';
import { CorridaCi } from '../db/corrida-ci.entity';
import { CorridaEtapa } from '../db/corrida-etapa.entity';
import { Artefacto } from '../db/artefacto.entity';
import { Proyecto } from '../db/proyecto.entity';
import { Auditoria } from '../db/auditoria.entity';
import { SesionTerminal } from '../db/sesion-terminal.entity';
import { Servidor } from '../db/servidor.entity';
import { PermisoServidor } from '../db/permiso-servidor.entity';
import { Secreto } from '../db/secreto.entity';

const remotosDir = mkdtempSync(join(tmpdir(), 'edp-ci-'));
let dataSource: DataSource;
let ci: CiService;
let proyectos: ProyectosService;

const PIPELINE = `
stages:
  - nombre: preparar
    comandos:
      - echo "instalando dependencias"
      - cp src/app.txt src/app-preparado.txt
  - nombre: construir
    comandos:
      - mkdir -p dist
      - cp src/app-preparado.txt dist/artefacto.txt
artefactos:
  - ruta: dist/artefacto.txt
    etiqueta: notas-api
`;

// semilla del remoto: repo con el pipeline + código fuente + un commit
function prepararRemoto(): { url: string; sha: string; proyectoId: string } {
  const nombre = `${randomUUID()}.git`;
  const bare = join(remotosDir, nombre);
  spawnSync('git', ['init', '--bare', '-b', 'main', bare], { encoding: 'utf8' });
  const trabajo = join(remotosDir, `trabajo-${nombre}`);
  rmSync(trabajo, { recursive: true, force: true });
  spawnSync('git', ['clone', '-q', bare, trabajo], { encoding: 'utf8' });
  mkdirSync(join(trabajo, 'src'), { recursive: true });
  writeFileSync(join(trabajo, '.edp-pipeline.yml'), PIPELINE, 'utf8');
  writeFileSync(join(trabajo, 'src', 'app.txt'), 'codigo fuente\n', 'utf8');
  spawnSync('git', ['-C', trabajo, 'add', '.'], { encoding: 'utf8' });
  spawnSync('git', ['-C', trabajo, '-c', 'user.email=o@edp', '-c', 'user.name=o', 'commit', '-qm', 'commit inicial'], { encoding: 'utf8' });
  spawnSync('git', ['-C', trabajo, 'push', '-q', 'origin', 'main'], { encoding: 'utf8' });
  const sha = spawnSync('git', ['-C', trabajo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

  const proyecto = { id: randomUUID(), url: `file:///remotos/${nombre}` };
  return { url: proyecto.url, sha, proyectoId: proyecto.id };
}

beforeAll(async () => {
  process.env.EDP_GIT_REMOTOS_DIR = remotosDir;
  process.env.EDP_MASTER_KEY = 'a'.repeat(64);
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env.DATABASE_URL ?? 'postgres://edp:edp_dev@localhost:5433/edp',
        entities: [CorridaCi, CorridaEtapa, Artefacto, Proyecto, Auditoria, SesionTerminal, Servidor, PermisoServidor, Secreto],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([CorridaCi, CorridaEtapa, Artefacto, Proyecto, Auditoria, SesionTerminal, Servidor, PermisoServidor, Secreto]),
    ],
    providers: [
      CiService,
      PipelineService,
      WorkspacesService,
      GitService,
      SecretosService,
      SanitizadorService,
      ProyectosService,
      ServidoresService,
      { provide: CifradorService, useFactory: () => new CifradorService(Buffer.from('a'.repeat(64), 'hex')) },
    ],
  }).compile();
  ci = moduleRef.get(CiService);
  proyectos = moduleRef.get(ProyectosService);
  dataSource = moduleRef.get(DataSource);
  await moduleRef.get(WorkspacesService).asegurarImagenBase();
}, 240000);

afterAll(() => {
  delete process.env.EDP_GIT_REMOTOS_DIR;
  delete process.env.EDP_MASTER_KEY;
  rmSync(remotosDir, { recursive: true, force: true });
});

describe('CiService — ejecutor de pipelines (F5-2)', () => {
  beforeEach(async () => {
    await dataSource.query('TRUNCATE corrida_etapas, artefactos, corridas_ci, proyectos, auditoria RESTART IDENTITY CASCADE');
  });

  it('ejecuta un pipeline de dos etapas: exitosa con logs y commitSha', { timeout: 180000 }, async () => {
    const { url, sha } = prepararRemoto();
    const p = await proyectos.crear({ nombre: 'CI OK', repoUrl: url });

    const corrida = await ci.ejecutarCorrida(p.id);
    expect(corrida.estado).toBe('exitosa');
    expect(corrida.commitSha).toBe(sha);
    const etapas = await dataSource.getRepository(CorridaEtapa).find({ where: { corridaId: corrida.id }, order: { iniciadoEn: 'ASC' } });
    expect(etapas.map((e) => e.estado)).toEqual(['exitosa', 'exitosa']);
    expect(etapas[0].salida).toContain('instalando dependencias');
    expect(etapas[0].terminadoEn).not.toBeNull();
  });

  it('etapa fallida: corrida fallida, logs capturados y las siguientes quedan pendientes', { timeout: 180000 }, async () => {
    const nombre = `${randomUUID()}.git`;
    const bare = join(remotosDir, nombre);
    spawnSync('git', ['init', '--bare', '-b', 'main', bare], { encoding: 'utf8' });
    const trabajo = join(remotosDir, `trabajo-fallo`);
    rmSync(trabajo, { recursive: true, force: true });
    spawnSync('git', ['clone', '-q', bare, trabajo], { encoding: 'utf8' });
    writeFileSync(join(trabajo, '.edp-pipeline.yml'), 'stages:\n  - nombre: romper\n    comandos: [exit 1]\n  - nombre: nunca\n    comandos: [echo nunca]\n', 'utf8');
    spawnSync('git', ['-C', trabajo, 'add', '.'], { encoding: 'utf8' });
    spawnSync('git', ['-C', trabajo, '-c', 'user.email=o@edp', '-c', 'user.name=o', 'commit', '-qm', 'pipeline roto'], { encoding: 'utf8' });
    spawnSync('git', ['-C', trabajo, 'push', '-q', 'origin', 'main'], { encoding: 'utf8' });
    const url = `file:///remotos/${nombre}`;
    const p = await proyectos.crear({ nombre: 'CI Roto', repoUrl: url });

    const corrida = await ci.ejecutarCorrida(p.id);
    expect(corrida.estado).toBe('fallida');
    const etapas = await dataSource.getRepository(CorridaEtapa).find({ where: { corridaId: corrida.id }, order: { iniciadoEn: 'ASC' } });
    expect(etapas[0].estado).toBe('fallida');
    expect(etapas[0].salida).toContain('exit 1');
    expect(etapas[1].estado).toBe('pendiente');
  });

  it('almacena artefactos con digest sha256', { timeout: 180000 }, async () => {
    const { url, proyectoId } = prepararRemoto();
    const p = await proyectos.crear({ nombre: 'CI Artefactos', repoUrl: url });
    const corrida = await ci.ejecutarCorrida(p.id);
    expect(corrida.estado).toBe('exitosa');
    const artefactos = await dataSource.getRepository(Artefacto).find({ where: { corridaId: corrida.id } });
    expect(artefactos).toHaveLength(1);
    expect(artefactos[0].etiqueta).toBe('notas-api');
    expect(artefactos[0].rutaRelativa).toBe('dist/artefacto.txt');
    expect(artefactos[0].digest).toMatch(/^[0-9a-f]{64}$/);
    expect(artefactos[0].contenido.toString('utf8')).toContain('codigo fuente');
  });

  it('sin .edp-pipeline.yml: la corrida falla con mensaje claro', { timeout: 180000 }, async () => {
    const nombre = `${randomUUID()}.git`;
    const bare = join(remotosDir, nombre);
    spawnSync('git', ['init', '--bare', '-b', 'main', bare], { encoding: 'utf8' });
    const trabajo = join(remotosDir, 'trabajo-sin-pipeline');
    rmSync(trabajo, { recursive: true, force: true });
    spawnSync('git', ['clone', '-q', bare, trabajo], { encoding: 'utf8' });
    writeFileSync(join(trabajo, 'leeme.txt'), 'sin pipeline\n', 'utf8');
    spawnSync('git', ['-C', trabajo, 'add', '.'], { encoding: 'utf8' });
    spawnSync('git', ['-C', trabajo, '-c', 'user.email=o@edp', '-c', 'user.name=o', 'commit', '-qm', 'sin pipeline'], { encoding: 'utf8' });
    spawnSync('git', ['-C', trabajo, 'push', '-q', 'origin', 'main'], { encoding: 'utf8' });
    const url = `file:///remotos/${nombre}`;
    const p = await proyectos.crear({ nombre: 'CI Sin Pipeline', repoUrl: url });

    await expect(ci.ejecutarCorrida(p.id)).rejects.toThrow(/edp-pipeline\.yml/);
    const corrida = await dataSource.getRepository(CorridaCi).findOneByOrFail({ proyectoId: p.id });
    expect(corrida.estado).toBe('fallida');
  });
});
