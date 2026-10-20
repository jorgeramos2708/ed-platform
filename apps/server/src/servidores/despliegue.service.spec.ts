// Fase 6 (RED): el despliegue con máquina de estados — comando terminado ≠ aplicación
// saludable; versión esperada == detectada Y health verde para 'exitoso'; rollback funcional.
// Fixture: el sshd de pruebas + la app notas-api empaquetada como artefacto.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DespliegueService } from './despliegue.service';
import { SecretosService } from '../secretos/secretos.service';
import { CifradorService } from '../secretos/cifrador.service';
import { SanitizadorService } from '../secretos/sanitizador.service';
import { ServidoresService } from './servidores.service';
import { SshService } from './ssh.service';
import { Servidor } from '../db/servidor.entity';
import { PermisoServidor } from '../db/permiso-servidor.entity';
import { Secreto } from '../db/secreto.entity';
import { Auditoria } from '../db/auditoria.entity';
import { Entorno } from '../db/entorno.entity';
import { Despliegue } from '../db/despliegue.entity';
import { DesplieguePaso } from '../db/despliegue-paso.entity';

const dir = mkdtempSync(join(tmpdir(), 'edp-cd-'));
let dataSource: DataSource;
let secretos: SecretosService;
let servidores: ServidoresService;
let servidorId = '';
let clavePrivada = '';

beforeAll(async () => {
  const rutaClave = join(dir, 'id_ed25519');
  const gen = spawnSync('ssh-keygen', ['-t', 'ed25519', '-f', rutaClave, '-N', '', '-q'], { timeout: 30000 });
  if (gen.status !== 0) throw new Error(`ssh-keygen falló: ${gen.stderr}`);
  clavePrivada = readFileSync(rutaClave, 'utf8');
  const clavePublica = readFileSync(`${rutaClave}.pub`, 'utf8');

  const contenedor = `edp-sshd-cd-${randomUUID().slice(0, 8)}`;
  const puerto = 20000 + Math.floor(Math.random() * 20000);
  const run = spawnSync(
    'docker',
    [
      'run', '-d', '--name', contenedor,
      '-p', `127.0.0.1:${puerto}:2222`,
      '-e', 'PUID=1000', '-e', 'PGID=1000',
      '-e', 'USER_NAME=spike',
      '-e', `PUBLIC_KEY=${clavePublica}`,
      '-e', 'PASSWORD_ACCESS=false',
      'lscr.io/linuxserver/openssh-server:latest',
    ],
    { encoding: 'utf8', timeout: 120000 },
  );
  if (run.status !== 0) throw new Error(`sshd fixture falló: ${run.stderr || run.error}`);

  process.env.EDP_MASTER_KEY = 'a'.repeat(64);
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env.DATABASE_URL ?? 'postgres://edp:edp_dev@localhost:5433/edp',
        entities: [Servidor, PermisoServidor, Secreto, Auditoria, Entorno, Despliegue, DesplieguePaso],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([Servidor, PermisoServidor, Secreto, Auditoria, Entorno, Despliegue, DesplieguePaso]),
    ],
    providers: [
      ServidoresService,
      SecretosService,
      SanitizadorService,
      SshService,
      DespliegueService,
      { provide: CifradorService, useFactory: () => new CifradorService(Buffer.from('a'.repeat(64), 'hex')) },
    ],
  }).compile();
  secretos = moduleRef.get(SecretosService);
  servidores = moduleRef.get(ServidoresService);
  dataSource = moduleRef.get(DataSource);

  // espera del banner SSH real (pgrep no existe en la imagen; el TCP engaña por docker-proxy)
  let listo = false;
  for (let i = 0; i < 30 && !listo; i++) {
    const ping = spawnSync('docker', ['exec', contenedor, 'sh', '-c', 'cat /etc/sshd_config >/dev/null 2>&1 || true'], { encoding: 'utf8' });
    try {
      const c = require('node:net').createConnection({ host: '127.0.0.1', port }, () => {});
      c.on('data', (d: Buffer) => {
        if (d.toString('utf8').includes('SSH-')) {
          c.destroy();
          listo = true;
        }
      });
      c.setTimeout(2000, () => {
        c.destroy();
      });
      c.on('error', () => {});
    } catch { /* reintento */ }
    if (!listo) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!listo) {
    // segundo intento: banner vía comando
    const banner = spawnSync('node', ['-e', `
      const net = require('node:net');
      const s = net.connect(${puerto}, '127.0.0.1', () => {});
      s.on('data', (d) => { console.log(d.toString('utf8').includes('SSH-') ? 'BANNER' : 'NO'); process.exit(0); });
      s.on('error', () => { console.log('ERR'); process.exit(0); });
      setTimeout(() => { console.log('ERR'); process.exit(0); }, 3000);
    `], { encoding: 'utf8', timeout: 8000 });
    listo = banner.stdout.includes('BANNER');
  }
  if (!listo) throw new Error('sshd no arrancó (sin banner)');

  const secreto = await secretos.crear({ nombre: `ssh-cd-${randomUUID()}`, valor: clavePrivada });
  const servidor = await servidores.crear({
    nombre: 'Servidor CD',
    host: '127.0.0.1',
    puerto,
    usuarioSsh: 'spike',
    credencialId: secreto.id,
  });
  servidorId = servidor.id;
  await dataSource.getRepository(Entorno).save(
    dataSource.getRepository(Entorno).create({ proyectoId: randomUUID(), nombre: 'desarrollo', requiereAprobacion: false }),
  );

  afterAll(() => {
    spawnSync('docker', ['rm', '-f', contenedor], { encoding: 'utf8', timeout: 30000 });
  });
}, 240000);

describe('DespliegueService — máquina de estados (Fase 6)', () => {
  it('healthCheck detecta app saludable vs caída', async () => {
    const { DespliegueService: DS } = await import('./despliegue.service');
    const servicio = new DS(secretos, servidores, dataSource);
    const health = (servicio as unknown as { healthCheck(u: string, e: string): Promise<{ ok: boolean; detalle: string }> })
      .healthCheck.bind(servicio);
    const caido = await health('http://127.0.0.1:1/health', '"status":"ok"');
    expect(caido.ok).toBe(false);
  });
});
