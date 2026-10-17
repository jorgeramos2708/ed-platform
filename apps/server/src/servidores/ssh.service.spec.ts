// F4-2: ejecución SSH REAL — sshd auténtico en contenedor (fixture validada en el spike S2),
// credencial (clave privada) guardada CIFRADA en el vault y descifrada just-in-time.
// La garantía de la puerta: sin permiso concedido, el acceso es denegado.
// MODO MANUAL: si EDP_SSHD_MANUAL_PORT y EDP_SSHD_MANUAL_KEY están definidos, se usa un sshd
// ya arrancado (fixture persistente para depurar) con su clave privada correspondiente.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ServidoresService } from './servidores.service';
import { SshService } from './ssh.service';
import { SecretosService } from '../secretos/secretos.service';
import { CifradorService } from '../secretos/cifrador.service';
import { SanitizadorService } from '../secretos/sanitizador.service';
import { Servidor } from '../db/servidor.entity';
import { PermisoServidor } from '../db/permiso-servidor.entity';
import { Secreto } from '../db/secreto.entity';
import { Auditoria } from '../db/auditoria.entity';

const dir = mkdtempSync(join(tmpdir(), 'edp-ssh-'));
let dataSource: DataSource;
let ssh: SshService;
let servidores: ServidoresService;
let secretos: SecretosService;
let contenedor = '';
let puertoHost = 0;
let clavePrivada = '';

beforeAll(async () => {
  const paso = (m: string) => console.log(`[ssh-spec] ${m}`);
  const puertoManual = process.env.EDP_SSHD_MANUAL_PORT;

  if (puertoManual) {
    // MODO MANUAL: sshd persistente ya arrancado + su clave privada por ruta
    puertoHost = Number(puertoManual);
    clavePrivada = readFileSync(process.env.EDP_SSHD_MANUAL_KEY!, 'utf8');
    paso(`usando sshd manual en el puerto ${puertoHost}`);
  } else {
    // 1. clave ed25519 para la fixture (el host tiene ssh-keygen vía git)
    paso('generando clave ed25519');
    const rutaClave = join(dir, 'id_ed25519');
    const gen = spawnSync('ssh-keygen', ['-t', 'ed25519', '-f', rutaClave, '-N', '', '-q'], { timeout: 30000 });
    if (gen.status !== 0) throw new Error(`ssh-keygen falló: ${gen.stderr}`);
    clavePrivada = readFileSync(rutaClave, 'utf8');
    const clavePublica = readFileSync(`${rutaClave}.pub`, 'utf8');

    // 2. sshd auténtico con puerto local FIJO aleatorio (binding a 127.0.0.1 explícito)
    contenedor = `edp-sshd-test-${randomUUID().slice(0, 8)}`;
    puertoHost = 20000 + Math.floor(Math.random() * 20000);
    paso(`levantando sshd en el puerto ${puertoHost}`);
    const run = spawnSync(
      'docker',
      [
        'run', '-d', '--name', contenedor,
        '-p', `127.0.0.1:${puertoHost}:2222`,
        '-e', 'PUID=1000', '-e', 'PGID=1000',
        '-e', 'USER_NAME=spike',
        '-e', `PUBLIC_KEY=${clavePublica}`,
        '-e', 'PASSWORD_ACCESS=false',
        'lscr.io/linuxserver/openssh-server:latest',
      ],
      { encoding: 'utf8', timeout: 120000 },
    );
    if (run.status !== 0) throw new Error(`sshd fixture falló: ${run.stderr || run.error}`);
  }

  // 3. módulo con la clave maestra de tests
  paso('inicializando módulo Nest');
  process.env.EDP_MASTER_KEY = 'a'.repeat(64);
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env.DATABASE_URL ?? 'postgres://edp:edp_dev@localhost:5433/edp',
        entities: [Servidor, PermisoServidor, Secreto, Auditoria],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([Servidor, PermisoServidor, Secreto, Auditoria]),
    ],
    providers: [
      ServidoresService,
      SecretosService,
      SanitizadorService,
      SshService,
      { provide: CifradorService, useFactory: () => new CifradorService(Buffer.from('a'.repeat(64), 'hex')) },
    ],
  }).compile();
  ssh = moduleRef.get(SshService);
  servidores = moduleRef.get(ServidoresService);
  secretos = moduleRef.get(SecretosService);
  dataSource = moduleRef.get(DataSource);

  // 4. espera del BANNER SSH real (el readiness TCP engaña: docker-proxy acepta antes de que sshd atienda)
  paso('esperando banner SSH');
  let listo = false;
  for (let i = 0; i < 40 && !listo; i++) {
    listo = await new Promise<boolean>((resolve) => {
      const s = createConnection({ host: '127.0.0.1', port: puertoHost }, () => {});
      s.on('data', (d: Buffer) => {
        if (d.toString('utf8').includes('SSH-')) {
          s.destroy();
          resolve(true);
        }
      });
      s.on('error', () => resolve(false));
      s.setTimeout(2000, () => {
        s.destroy();
        resolve(false);
      });
    });
    if (!listo) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!listo) throw new Error('sshd no arrancó (sin banner SSH en 60s)');
  paso('banner SSH recibido');
}, 300000);

afterAll(() => {
  // en modo manual el sshd persiste (no lo creamos, no lo matamos)
  if (contenedor) spawnSync('docker', ['rm', '-f', contenedor], { encoding: 'utf8', timeout: 30000 });
  rmSync(dir, { recursive: true, force: true });
  delete process.env.EDP_MASTER_KEY;
});

describe('SshService — ejecución real (F4-2)', () => {
  it('ejecuta un comando en un servidor autorizado con la credencial del vault', { timeout: 120000 }, async () => {
    // la clave privada REAL se guarda CIFRADA en el vault (crear → AES-256-GCM por DEK)
    const secreto = await secretos.crear({ nombre: `ssh-clave-${randomUUID()}`, valor: clavePrivada });
    const servidor = await servidores.crear({
      nombre: 'Auth OK',
      host: '127.0.0.1',
      puerto: puertoHost,
      usuarioSsh: 'spike',
      credencialId: secreto.id,
    });
    await servidores.concederPermiso(servidor.id, randomUUID(), ['ejecutar']); // otro usuario: no
    const usuarioAutorizado = randomUUID();
    await servidores.concederPermiso(servidor.id, usuarioAutorizado, ['ejecutar']);
    const r = await ssh.ejecutarComando(usuarioAutorizado, servidor.id, 'echo hola-ssh');
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain('hola-ssh');
  });

  it('sin permiso concedido: acceso denegado (ni siquiera intenta la conexión)', { timeout: 60000 }, async () => {
    const secreto = await secretos.crear({ nombre: `ssh-clave-${randomUUID()}`, valor: clavePrivada });
    const servidor = await servidores.crear({
      nombre: 'Sin Permiso',
      host: '127.0.0.1',
      puerto: puertoHost,
      usuarioSsh: 'spike',
      credencialId: secreto.id,
    });
    await expect(ssh.ejecutarComando(randomUUID(), servidor.id, 'echo x')).rejects.toThrow(
      /Acceso denegado/,
    );
  });

  it('con permiso solo de sftp: ejecutar queda denegado', { timeout: 60000 }, async () => {
    const secreto = await secretos.crear({ nombre: `ssh-clave-${randomUUID()}`, valor: clavePrivada });
    const servidor = await servidores.crear({
      nombre: 'Solo SFTP',
      host: '127.0.0.1',
      puerto: puertoHost,
      usuarioSsh: 'spike',
      credencialId: secreto.id,
    });
    const usuario = randomUUID();
    await servidores.concederPermiso(servidor.id, usuario, ['sftp']);
    await expect(ssh.ejecutarComando(usuario, servidor.id, 'echo x')).rejects.toThrow(
      /sin permiso de ejecutar/,
    );
  });
});

void copyFileSync; // reservado para fixtures por archivo
