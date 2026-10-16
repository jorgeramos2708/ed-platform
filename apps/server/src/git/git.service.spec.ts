// RED: GitService (Fase 3) — clonar el remoto en el workspace; el token viaja por GIT_ASKPASS
// y JAMÁS aparece en el comando del shell (solo en el env del contenedor efímero)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { GitService, construirComandoClonar, construirComandoPull, construirComandoPush } from './git.service';

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

  it('pull y push con token: el token NUNCA va en el comando', () => {
    const token = 'ghp_otro-secreto-987';
    const push = construirComandoPush(token);
    const pull = construirComandoPull('main', token);
    expect(push.comando).not.toContain(token);
    expect(pull.comando).not.toContain(token);
    expect(push.env.GIT_TOKEN).toBe(token);
    expect(pull.env.GIT_TOKEN).toBe(token);
  });

  it('rechaza clonar file:// sin el directorio de remotos de prueba', async () => {
    delete process.env.EDP_GIT_REMOTOS_DIR;
    const ws = await workspaces.crear(proyectoId, { gitInit: false });
    await expect(
      git.clonar(proyectoId, ws.id, { url: 'file:///remotos/no-debe-funcionar.git' }),
    ).rejects.toThrow(/file:\/\/ solo está permitido en pruebas/);
    process.env.EDP_GIT_REMOTOS_DIR = remotosDir;
  });

  describe('push/pull/historial/ramas (F3-3)', () => {
    it('push publica el commit local: el round-trip llega al origen', { timeout: 120000 }, async () => {
      const url = prepararOrigen();
      const ws = await workspaces.crear(proyectoId, { gitInit: false });
      await git.clonar(proyectoId, ws.id, { url });
      await workspaces.ejecutar(
        proyectoId,
        ws.id,
        'echo "cambio local" > cambio.txt && git add . && git -c user.email=w@edp -c user.name=w commit -qm "cambio local"',
      );
      const r = await git.push(proyectoId, ws.id, { rama: 'main' });
      expect(r.codigo).toBe(0);
      // round-trip: un workspace fresco recibe el cambio
      const ws2 = await workspaces.crear(proyectoId, { gitInit: false });
      await git.clonar(proyectoId, ws2.id, { url });
      const verificacion = await workspaces.ejecutar(proyectoId, ws2.id, 'cat cambio.txt');
      expect(verificacion.salida).toContain('cambio local');
    });

    it('push rechazado si el origen avanzó: el trabajo local NO se pierde', { timeout: 120000 }, async () => {
      const url = prepararOrigen();
      const ws = await workspaces.crear(proyectoId, { gitInit: false });
      await git.clonar(proyectoId, ws.id, { url });
      // el origen avanza por otro camino (host)
      const espejo = join(remotosDir, 'espejo-avance');
      rmSync(espejo, { recursive: true, force: true });
      spawnSync('git', ['clone', '-q', url.replace('file:///remotos', remotosDir), espejo], { encoding: 'utf8' });
      writeFileSync(join(espejo, 'remoto.txt'), 'avance del remoto\n', 'utf8');
      spawnSync('git', ['-C', espejo, 'add', '.'], { encoding: 'utf8' });
      spawnSync('git', ['-C', espejo, '-c', 'user.email=o@edp', '-c', 'user.name=o', 'commit', '-qm', 'avance remoto'], { encoding: 'utf8' });
      const pushRemoto = spawnSync('git', ['-C', espejo, 'push', '-q'], { encoding: 'utf8' });
      if (pushRemoto.status !== 0) throw new Error(`avance del origen falló: ${pushRemoto.stderr}`);
      // trabajo local en paralelo
      await workspaces.ejecutar(
        proyectoId,
        ws.id,
        'echo "trabajo local" > local.txt && git add . && git -c user.email=w@edp -c user.name=w commit -qm "trabajo local"',
      );
      const rechazado = await git.push(proyectoId, ws.id, { rama: 'main' });
      expect(rechazado.codigo).not.toBe(0);
      // SIN PERDER EL TRABAJO: el commit local sigue en el workspace
      const log = await workspaces.ejecutar(proyectoId, ws.id, 'git log --oneline -2');
      expect(log.salida).toContain('trabajo local');
      const archivo = await workspaces.ejecutar(proyectoId, ws.id, 'cat local.txt');
      expect(archivo.salida).toContain('trabajo local');
      // pull --rebase integra el avance y el push ahora pasa
      const pull = await git.pull(proyectoId, ws.id, { rama: 'main' });
      expect(pull.codigo).toBe(0);
      const pushFinal = await git.push(proyectoId, ws.id, { rama: 'main' });
      expect(pushFinal.codigo).toBe(0);
    });

    it('pull con conflicto: aborta el rebase y preserva el trabajo local', { timeout: 120000 }, async () => {
      const url = prepararOrigen();
      const ws = await workspaces.crear(proyectoId, { gitInit: false });
      await git.clonar(proyectoId, ws.id, { url });
      // el remoto modifica leeme.md
      const espejo = join(remotosDir, 'espejo-conflicto');
      rmSync(espejo, { recursive: true, force: true });
      spawnSync('git', ['clone', '-q', url.replace('file:///remotos', remotosDir), espejo], { encoding: 'utf8' });
      writeFileSync(join(espejo, 'leeme.md'), 'versión del remoto\n', 'utf8');
      spawnSync('git', ['-C', espejo, 'add', '.'], { encoding: 'utf8' });
      spawnSync('git', ['-C', espejo, '-c', 'user.email=o@edp', '-c', 'user.name=o', 'commit', '-qm', 'remoto toca leeme'], { encoding: 'utf8' });
      spawnSync('git', ['-C', espejo, 'push', '-q'], { encoding: 'utf8' });
      // el local modifica el MISMO archivo
      await workspaces.ejecutar(
        proyectoId,
        ws.id,
        'echo "versión local" > leeme.md && git add . && git -c user.email=w@edp -c user.name=w commit -qm "local toca leeme"',
      );
      const pull = await git.pull(proyectoId, ws.id, { rama: 'main' });
      expect(pull.codigo).not.toBe(0); // conflicto
      expect(pull.conflicto).toBe(true);
      // el rebase se abortó: workspace limpio en el commit local, SIN perder nada
      const estado = await workspaces.ejecutar(proyectoId, ws.id, 'git status --porcelain');
      expect(estado.salida.trim()).toBe('');
      const log = await workspaces.ejecutar(proyectoId, ws.id, 'git log --oneline -1');
      expect(log.salida).toContain('local toca leeme');
    });

    it('historial y ramas del workspace', { timeout: 120000 }, async () => {
      const url = prepararOrigen();
      const ws = await workspaces.crear(proyectoId, { gitInit: false });
      await git.clonar(proyectoId, ws.id, { url });
      const historial = await git.historial(proyectoId, ws.id, 10);
      expect(historial.length).toBeGreaterThan(0);
      expect(historial[0]).toMatchObject({ hash: expect.any(String), asunto: expect.any(String) });
      const ramas = await git.ramas(proyectoId, ws.id);
      expect(ramas).toContain('main');
    });
  });
});
