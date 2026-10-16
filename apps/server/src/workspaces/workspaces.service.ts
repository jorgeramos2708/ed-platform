import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export interface ResultadoComando {
  codigo: number;
  salida: string;
  salidaError: string;
}

export interface WorkspaceInfo {
  id: string;
  proyectoId: string;
}

// Workspaces aislados (E06, ADR-0006): cada comando corre en un contenedor efímero con el
// set completo de banderas S1 — la batería del spike es PRUEBA DE REGRESIÓN en el spec.
// Sin socket de Docker en los contenedores de tarea; el orquestador (esta API) es quien lo usa.
@Injectable()
export class WorkspacesService {
  private readonly raizLocal = process.env.EDP_WORKSPACES_ROOT ?? join(tmpdir(), 'edp-workspaces');
  // La ruta que ve el DAEMON (en compose, el volumen montado en el contenedor api)
  private readonly raizDaemon =
    process.env.EDP_WORKSPACES_DAEMON_ROOT ?? process.env.EDP_WORKSPACES_ROOT ?? join(tmpdir(), 'edp-workspaces');
  private readonly imagenBase = process.env.EDP_WORKSPACE_IMAGE ?? 'edp-workspace-base';

  async asegurarImagenBase(): Promise<void> {
    const existe = this.docker(['images', '-q', this.imagenBase]).salida.trim().length > 0;
    if (existe) return;
    const contexto = this.contextoImagenBase();
    const construccion = this.docker(['build', '-q', '-t', this.imagenBase, contexto], { timeoutMs: 240000 });
    if (construccion.codigo !== 0) {
      throw new Error(`No pude construir la imagen base del workspace (contexto ${contexto}): ${construccion.salidaError}`);
    }
  }

  // El contexto del build depende de desde dónde se ejecute (raíz del repo, apps/server o contenedor);
  // en el contenedor la imagen ya existe (la construye compose), así que solo se usa en host/tests
  private contextoImagenBase(): string {
    if (process.env.EDP_WORKSPACE_BASE_CONTEXT) return process.env.EDP_WORKSPACE_BASE_CONTEXT;
    const candidatos = [
      join(process.cwd(), 'apps', 'workspace-base'),
      join(process.cwd(), '..', 'workspace-base'),
      join(process.cwd(), 'workspace-base'),
    ];
    const encontrado = candidatos.find((c) => existsSync(join(c, 'Dockerfile')));
    if (!encontrado) throw new Error(`No encontré el contexto de la imagen base (probé: ${candidatos.join(', ')})`);
    return encontrado;
  }

  async crear(proyectoId: string, opciones?: { gitInit?: boolean }): Promise<WorkspaceInfo> {
    const id = randomUUID();
    const ruta = this.rutaLocal(proyectoId, id);
    mkdirSync(ruta, { recursive: true });
    if (opciones?.gitInit === false) {
      // Fase 3: el workspace se llenará con `git clone` del remoto (GitService) — sin init vacío
      return { id, proyectoId };
    }
    // git init A TRAVÉS del contenedor base: el tooling del workspace vive en la imagen,
    // no en el host ni en el contenedor api (autocrlf=false — lección S4 del rewind exacto)
    const r = this.docker(
      [
        'run', '--rm',
        '--network', 'none',
        '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges',
        '--read-only', '--tmpfs', '/tmp:rw,size=16m',
        '-v', `${this.rutaDaemon(proyectoId, id)}:/workspace`,
        '-w', '/workspace',
        this.imagenBase,
        'sh', '-c', 'git init -q -b main && git config --local core.autocrlf false && git config --local user.email workspace@edp && git config --local user.name workspace',
      ],
      { timeoutMs: 60000 },
    );
    if (r.codigo !== 0) throw new Error(`git init del workspace falló: ${r.salidaError}`);
    return { id, proyectoId };
  }

  async ejecutar(
    proyectoId: string,
    workspaceId: string,
    comando: string,
    opciones?: { extraBinds?: string[]; env?: Record<string, string>; timeoutMs?: number },
  ): Promise<ResultadoComando> {
    const rutaLocal = this.rutaLocal(proyectoId, workspaceId);
    if (!existsSync(rutaLocal)) throw new Error(`El workspace ${workspaceId} no existe`);
    const rutaDaemon = this.rutaDaemon(proyectoId, workspaceId);
    // Banderas S1 completas (ADR-0006): red none, caps fuera, no-new-privileges, rootfs de solo
    // lectura, tmpfs, límites de memoria/pids y SOLO el bind del workspace (+ extras explícitos,
    // p. ej. el directorio de remotos de prueba read-only cuando EDP_GIT_REMOTOS_DIR está definido)
    const r = spawnSync(
      'docker',
      [
        'run', '--rm',
        '--network', 'none',
        '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges',
        '--read-only', '--tmpfs', '/tmp:rw,size=16m',
        '--pids-limit', '64',
        '--memory', '256m',
        '-v', `${rutaDaemon}:/workspace`,
        ...(opciones?.extraBinds ?? []).flatMap((b) => ['-v', b]),
        ...Object.entries(opciones?.env ?? {}).flatMap(([k, v]) => ['--env', `${k}=${v}`]),
        '-w', '/workspace',
        this.imagenBase,
        'sh', '-c', comando,
      ],
      { encoding: 'utf8', timeout: opciones?.timeoutMs ?? 90000 },
    );
    return { codigo: r.status ?? -1, salida: r.stdout ?? '', salidaError: r.stderr ?? '' };
  }

  private rutaLocal(proyectoId: string, id: string): string {
    return resolve(join(this.raizLocal, proyectoId, id));
  }

  private rutaDaemon(proyectoId: string, id: string): string {
    return resolve(join(this.raizDaemon, proyectoId, id));
  }

  private docker(args: string[], opciones?: { timeoutMs?: number }): ResultadoComando {
    const r = spawnSync('docker', args, { encoding: 'utf8', timeout: opciones?.timeoutMs ?? 60000 });
    return { codigo: r.status ?? -1, salida: r.stdout ?? '', salidaError: r.stderr ?? '' };
  }
}
