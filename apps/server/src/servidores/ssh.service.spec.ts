// F4-2/F4-4: SSH real y SFTP — fixture PERSISTENTE gestionada por levantar-sshd.ps1
// (el modo con contenedor propio dentro del spec resultó inherentemente inestable en Windows:
// el pull/arranque dentro del beforeAll colgó tres veces — lección documentada).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
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
let clavePrivada = '';
let puertoHost = 0;

beforeAll(async () => {
  // 1. fixture SSH persistente: el script levanta/reutiliza el sshd y devuelve PUERTO|RUTA_CLAVE
  const script = join(__dirname, '..', '..', 'test', 'levantar-sshd.ps1');
  const resultado = spawnSync('pwsh', ['-NoProfile', '-File', script, '-Puerto', '2299'], {
    encoding: 'utf8',
    timeout: 120000,
  });
  const linea = [...resultado.stdout.trim().split('\n')].reverse().find((l) => l.includes('|'));
  if (resultado.status !== 0 || !linea) {
    throw new Error(`fixture sshd falló: ${resultado.stderr || resultado.stdout}`);
  }
  const [puerto, rutaClave] = linea.trim().split('|');
  puertoHost = Number(puerto);
  clavePrivada = readFileSync(rutaClave, 'utf8');

  // 2. módulo con la clave maestra de tests
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
}, 240000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.EDP_MASTER_KEY;
});

// la credencial del vault: la clave privada de la fixture (cifrada por el vault)
async function crearServidorConClave(nombre: string, acciones: string[]): Promise<{ servidorId: string; usuarioId: string }> {
  const secreto = await secretos.crear({ nombre: `ssh-clave-${randomUUID()}`, valor: clavePrivada });
  const servidor = await servidores.crear({
    nombre,
    host: '127.0.0.1',
    puerto: puertoHost,
    usuarioSsh: 'spike',
    credencialId: secreto.id,
  });
  const usuarioId = randomUUID();
  await servidores.concederPermiso(servidor.id, usuarioId, acciones);
  return { servidorId: servidor.id, usuarioId };
}

describe('SshService — SSH real y SFTP (F4-2/F4-4)', () => {
  it('ejecuta un comando en un servidor autorizado con la credencial del vault', { timeout: 120000 }, async () => {
    const { servidorId, usuarioId } = await crearServidorConClave('Auth OK', ['ejecutar']);
    const r = await ssh.ejecutarComando(usuarioId, servidorId, 'echo hola-ssh');
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain('hola-ssh');
  });

  it('sin permiso concedido: acceso denegado (ni siquiera intenta la conexión)', { timeout: 60000 }, async () => {
    const { servidorId } = await crearServidorConClave('Sin Permiso', []);
    await expect(ssh.ejecutarComando(randomUUID(), servidorId, 'echo x')).rejects.toThrow(
      /Acceso denegado/,
    );
  });

  it('con permiso solo de sftp: ejecutar queda denegado', { timeout: 60000 }, async () => {
    const { servidorId, usuarioId } = await crearServidorConClave('Solo SFTP', ['sftp']);
    await expect(ssh.ejecutarComando(usuarioId, servidorId, 'echo x')).rejects.toThrow(
      /sin permiso de ejecutar/,
    );
  });

  it('SFTP: sube un archivo y lo verifica leyéndolo en el servidor', { timeout: 120000 }, async () => {
    const { servidorId, usuarioId } = await crearServidorConClave('SFTP Sube', ['sftp', 'ejecutar']);
    const contenido = Buffer.from(`contenido sftp ${randomUUID()}\n`, 'utf8');
    const r = await ssh.subir(usuarioId, servidorId, '/config/prueba-sftp.txt', contenido);
    expect(r.ok).toBe(true);
    const verificacion = await ssh.ejecutarComando(usuarioId, servidorId, 'cat /config/prueba-sftp.txt');
    expect(verificacion.salida).toBe(contenido.toString('utf8'));
  });

  it('SFTP: descarga un archivo que ya existe en el servidor', { timeout: 120000 }, async () => {
    const { servidorId, usuarioId } = await crearServidorConClave('SFTP Descarga', ['sftp', 'ejecutar']);
    const esperado = `archivo remoto ${randomUUID()}`;
    await ssh.ejecutarComando(usuarioId, servidorId, `echo "${esperado}" > /config/descarga.txt`);
    const contenido = await ssh.descargar(usuarioId, servidorId, '/config/descarga.txt');
    expect(contenido.toString('utf8')).toContain(esperado);
  });

  it('SFTP sin permiso: denegado', { timeout: 60000 }, async () => {
    const { servidorId } = await crearServidorConClave('SFTP Sin Permiso', ['ejecutar']);
    await expect(
      ssh.subir(randomUUID(), servidorId, '/config/x.txt', Buffer.from('x')),
    ).rejects.toThrow(/Acceso denegado/);
  });
});
