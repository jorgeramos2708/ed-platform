// F4-3: terminal interactiva — e2e con WebSocket real contra el gateway:
// auth por token → conectar con permiso 'terminal' → PTY con salida real → cerrar → sesión auditada.
// MODO MANUAL (fiable en este entorno): EDP_SSHD_MANUAL_PORT/KEY apuntan a un sshd persistente
// (edp-sshd-banner en 127.0.0.1:2299); el modo con contenedor propio colgó dos veces aquí.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { INestApplication } from '@nestjs/common';
import { WebSocket } from 'ws';
import { TerminalBridgeService } from '../src/servidores/terminal-bridge.service';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ServidoresService } from '../src/servidores/servidores.service';
import { SecretosService } from '../src/secretos/secretos.service';
import { SesionTerminal } from '../src/db/sesion-terminal.entity';
import { Usuario } from '../src/db/usuario.entity';
import { Secreto } from '../src/db/secreto.entity';

const dir = mkdtempSync(join(tmpdir(), 'edp-term-'));
let app: INestApplication;
let dataSource: DataSource;
let servidores: ServidoresService;
let contenedor = '';
let puertoSshd = 0;
let baseUrl = '';

beforeAll(async () => {
  const puertoManual = process.env.EDP_SSHD_MANUAL_PORT;
  let clavePrivada = '';
  if (puertoManual) {
    puertoSshd = Number(puertoManual);
    clavePrivada = readFileSync(process.env.EDP_SSHD_MANUAL_KEY!, 'utf8');
  } else {
    const rutaClave = join(dir, 'id_ed25519');
    const gen = spawnSync('ssh-keygen', ['-t', 'ed25519', '-f', rutaClave, '-N', '', '-q'], { timeout: 30000 });
    if (gen.status !== 0) throw new Error(`ssh-keygen falló: ${gen.stderr}`);
    const clavePublica = readFileSync(`${rutaClave}.pub`, 'utf8');
    clavePrivada = readFileSync(rutaClave, 'utf8');
    contenedor = `edp-sshd-term-${randomUUID().slice(0, 8)}`;
    puertoSshd = 20000 + Math.floor(Math.random() * 20000);
    const run = spawnSync(
      'docker',
      [
        'run', '-d', '--name', contenedor,
        '-p', `127.0.0.1:${puertoSshd}:2222`,
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

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  await app.get(TerminalBridgeService).registrarEn(app.getHttpServer());
  baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  dataSource = app.get(DataSource);
  servidores = app.get(ServidoresService);

  // usuario de pruebas + la clave privada registrada en el vault (cifrada, vía servicio)
  await request(app.getHttpServer())
    .post('/api/auth/registro')
    .send({ email: `term-${randomUUID()}@ed.test`, nombre: 'Term', password: 'ClaveSegura-1' })
    .expect(201);
  const secretoClave = await app
    .get(SecretosService)
    .crear({ nombre: `ssh-clave-${randomUUID()}`, valor: clavePrivada });
  globalThis.secretoClaveId = secretoClave.id;
}, 300000);

afterAll(async () => {
  if (contenedor) spawnSync('docker', ['rm', '-f', contenedor], { encoding: 'utf8', timeout: 30000 });
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('TerminalGateway (F4-3)', () => {
  it('conecta una PTY real, muestra la salida y audita la sesión', { timeout: 120000 }, async () => {
    const usuario = await dataSource.getRepository(Usuario).findOneByOrFail({ nombre: 'Term' });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: usuario.email, password: 'ClaveSegura-1' })
      .expect(200);
    const token = login.body.token;
    const secreto = await dataSource.getRepository(Secreto).findOneByOrFail({ id: (globalThis as Record<string, string>).secretoClaveId });
    const servidor = await servidores.crear({
      nombre: 'Servidor Terminal',
      host: '127.0.0.1',
      puerto: puertoSshd,
      usuarioSsh: 'spike',
      credencialId: secreto.id,
    });
    await servidores.concederPermiso(servidor.id, usuario.id, ['terminal']);

    const cliente = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/api/terminal?token=${token}`);
    const mensajes: { event: string; data: Record<string, unknown> }[] = [];
    await new Promise<void>((resolve, reject) => {
      cliente.on('open', () => {
        cliente.send(JSON.stringify({ tipo: 'conectar', servidorId: servidor.id }));
      });
      cliente.on('message', (d: Buffer) => {
        const m = JSON.parse(d.toString('utf8'));
        mensajes.push(m);
        console.log('[term-e2e] mensaje:', JSON.stringify(m).slice(0, 120));
        if (m.tipo === 'conectado') {
          setTimeout(() => cliente.send(JSON.stringify({ tipo: 'entrada', datos: 'echo marcador-terminal\n' })), 600);
        }
        if (m.tipo === 'datos' && String((m as { contenido?: string }).contenido).includes('marcador-terminal')) {
          setTimeout(() => resolve(), 300);
        }
      });
      cliente.on('error', reject);
      setTimeout(() => reject(new Error('timeout esperando la salida de la PTY')), 60000);
    });

    cliente.close();
    await new Promise((r) => setTimeout(r, 800));
    const sesiones = await dataSource.getRepository(SesionTerminal).find({ where: { servidorId: servidor.id } });
    expect(sesiones.length).toBeGreaterThan(0);
    expect(sesiones[0].cerradaEn).not.toBeNull();
    expect(mensajes.some((m) => JSON.stringify(m).includes('marcador-terminal'))).toBe(true);
  });

  it('sin permiso de terminal: el gateway rechaza el conectar', { timeout: 60000 }, async () => {
    const usuario = await dataSource.getRepository(Usuario).findOneByOrFail({ nombre: 'Term' });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: usuario.email, password: 'ClaveSegura-1' })
      .expect(200);
    const token = login.body.token;
    const secreto = await dataSource.getRepository(Secreto).findOneByOrFail({ id: (globalThis as Record<string, string>).secretoClaveId });
    const servidor = await servidores.crear({
      nombre: 'Servidor Sin Terminal',
      host: '127.0.0.1',
      puerto: puertoSshd,
      usuarioSsh: 'spike',
      credencialId: secreto.id,
    });
    await servidores.concederPermiso(servidor.id, usuario.id, ['ejecutar']); // SIN terminal

    const cliente = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/api/terminal?token=${token}`);
    const respuesta = await new Promise<{ event: string; data: Record<string, unknown> }>((resolve, reject) => {
      cliente.on('open', () => {
        cliente.send(JSON.stringify({ tipo: 'conectar', servidorId: servidor.id }));
      });
      cliente.on('message', (d: Buffer) => {
        const m = JSON.parse(d.toString('utf8'));
        if (m.tipo === 'error') resolve(m);
      });
      cliente.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 15000);
    });
    expect(respuesta.tipo).toBe('error');
    expect(respuesta.mensaje).toMatch(/Acceso denegado/i);
    cliente.close();
  });
});
