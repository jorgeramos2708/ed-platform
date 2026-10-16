// RED: GitService (Fase 3) — clonar el remoto en el workspace; el token viaja por GIT_ASKPASS
// y JAMÁS aparece en el comando del shell (solo en el env del contenedor efímero)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { GitService, construirComandoClonar } from './git.service';

// Remotos de prueba: bare repos en un directorio temporal del host, montado read-only
// en el contenedor de tarea SOLO cuando EDP_GIT_REMOTOS_DIR está definido (afordancia de pruebas)
const remotosDir = mkdtempSync(join(tmpdir(), 'edp-remotos-'));
const workspaces = new WorkspacesService();
const git = new GitService(workspaces);
const proyectoId = randomUUID();

function prepararOrigen(): string {
  const nombre = `${randomUUID()}.git`;
  const url = `file:///remotos/${nombre}`;
  const rutaBare = join(remotosDir, nombre);
  spawnSync('git', ['init', '--bare', '-b', 'main', rutaBare], { encoding: 'utf8' });
  const semilla = join(remotosDir, 'semilla');
  rmSync(semilla, { recursive: true, force: true });
  spawnSync('git', ['clone', '-q', rutaBare, semilla], { encoding: 'utf8' });
  writeFileSync(join(semilla, 'leeme.md'), 'contenido sembrado\n', 'utf8');
  spawnSync('git', ['-C', semilla, 'add', '.'], { encoding: 'utf8' });
  spawnSync('git', ['-C', semilla, '-c', 'user.email=test@edp', '-c', 'user.name=test', 'commit', '-qm', 'commit semilla'], { encoding: 'utf8' });
  const push = spawnSync('git', ['-C', semilla, 'push', '-q', 'origin', 'main'], { encoding: 'utf8' });
  if (push.status !== 0) throw new Error(`siembra del origen falló: ${push.stderr}`);
  return url;
}

beforeAll(async () => {
  process.env.EDP_GIT_REMOTOS_DIR = remotosDir;
  await workspaces.asegurarImagenBase();
}, 240000);

afterAll(() => {
  delete process.env.EDP_GIT_REMOTOS_DIR;
  rmSync(remotosDir, { recursive: true, force: true });
});

describe('GitService — clonar el remoto en el workspace', () => {
  it('clona un remoto y el workspace queda con el historial sembrado', { timeout: 120000 }, async () => {
    const url = prepararOrigen();
    const ws = await workspaces.crear(proyectoId, { gitInit: false });
    const r = await git.clonar(proyectoId, ws.id, { url });
    expect(r.codigo).toBe(0);
    const log = await workspaces.ejecutar(proyectoId, ws.id, 'git log --oneline -1');
    expect(log.salida).toContain('commit semilla');
    const archivo = await workspaces.ejecutar(proyectoId, ws.id, 'cat leeme.md');
    expect(archivo.salida).toContain('contenido sembrado');
  });

  it('clona una rama concreta con -b', { timeout: 120000 }, async () => {
    const url = prepararOrigen();
    const ws = await workspaces.crear(proyectoId, { gitInit: false });
    const r = await git.clonar(proyectoId, ws.id, { url, rama: 'main' });
    expect(r.codigo).toBe(0);
    const rama = await workspaces.ejecutar(proyectoId, ws.id, 'git branch --show-current');
    expect(rama.salida.trim()).toBe('main');
  });

  it('construirComandoClonar: el token NUNCA va en el comando del shell (solo en env del contenedor)', () => {
    const token = 'ghp_secreto-supersecreto-123456';
    const { comando, env } = construirComandoClonar('https://github.com/org/repo.git', 'main', token);
    expect(comando).not.toContain(token); // el comando sh no contiene el token
    expect(comando).toContain('GIT_ASKPASS=/tmp/askpass.sh'); // la credencial via askpass
    expect(env.GIT_TOKEN).toBe(token); // el token via env del contenedor efímero (documentado)
    expect(comando).toContain('git clone -b main https://github.com/org/repo.git /workspace');
  });

  it('rechaza clonar file:// sin el directorio de remotos de prueba', async () => {
    delete process.env.EDP_GIT_REMOTOS_DIR;
    const ws = await workspaces.crear(proyectoId, { gitInit: false });
    await expect(
      git.clonar(proyectoId, ws.id, { url: 'file:///remotos/no-debe-funcionar.git' }),
    ).rejects.toThrow(/file:\/\/ solo está permitido en pruebas/);
    process.env.EDP_GIT_REMOTOS_DIR = remotosDir;
  });
});
