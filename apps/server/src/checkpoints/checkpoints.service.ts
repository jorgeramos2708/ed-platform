import { Injectable } from '@nestjs/common';
import { WorkspacesService, ResultadoComando } from '../workspaces/workspaces.service';

// Árbol vacío universal de git: permite diff del PRIMER checkpoint (sin padre)
const ARBOL_VACIO = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export interface Checkpoint {
  hash: string;
  diff: string;
}

export interface EstadoWorkspace {
  head: string;
  limpio: boolean;
  pendientes: string;
}

// Checkpoints y rewind exactos (S4) sobre el workspace real:
// el "aceptar/descartar" de M2 se apoya aquí — rewind verificado por hash de HEAD y árbol limpio.
// Los hashes/referencias se VALIDAN antes de ir al shell (frontera de seguridad).
@Injectable()
export class CheckpointsService {
  constructor(private readonly workspaces: WorkspacesService) {}

  private async git(proyectoId: string, wsId: string, args: string): Promise<ResultadoComando> {
    // safe.directory: el workspace lo creó el host (propietario distinto del uid del contenedor)
    return this.workspaces.ejecutar(proyectoId, wsId, `git -c safe.directory=/workspace ${args}`);
  }

  private validarReferencia(referencia: string): string {
    if (!/^[0-9a-fA-F]{40}$/.test(referencia) && referencia !== 'HEAD') {
      throw new Error(`Referencia git inválida: ${referencia}`);
    }
    return referencia;
  }

  // El mensaje viaja dentro de sh -c 'git commit -m "..."' — fuera comillas, backslashes, $ y backticks
  private sanitizarMensaje(mensaje: string): string {
    return mensaje.replace(/["\\`$]/g, ' ').trim() || 'checkpoint';
  }

  async crear(proyectoId: string, wsId: string, mensaje: string): Promise<Checkpoint> {
    const add = await this.git(proyectoId, wsId, 'add -A');
    if (add.codigo !== 0) throw new Error(`git add falló: ${add.salidaError}`);
    const commit = await this.git(
      proyectoId,
      wsId,
      `commit -q --allow-empty -m "${this.sanitizarMensaje(mensaje)}"`,
    );
    if (commit.codigo !== 0) throw new Error(`git commit falló: ${commit.salidaError}`);
    const hash = (await this.git(proyectoId, wsId, 'rev-parse HEAD')).salida.trim();
    const padre = await this.git(proyectoId, wsId, 'rev-parse HEAD~1');
    const base = padre.codigo === 0 ? padre.salida.trim() : ARBOL_VACIO;
    const diff = (await this.git(proyectoId, wsId, `diff ${base} ${hash} --unified=0`)).salida;
    return { hash, diff };
  }

  async diff(proyectoId: string, wsId: string, desde: string, hasta = 'HEAD'): Promise<string> {
    const r = await this.git(
      proyectoId,
      wsId,
      `diff ${this.validarReferencia(desde)} ${this.validarReferencia(hasta)} --unified=0`,
    );
    return r.salida;
  }

  // Cambios PENDIENTES (working tree vs último checkpoint) — lo que la UI muestra para aceptar/descartar
  async diffPendiente(proyectoId: string, wsId: string): Promise<string> {
    return (await this.git(proyectoId, wsId, 'diff HEAD --unified=0')).salida;
  }

  // Rewind EXACTO: reset --hard + clean de huérfanos; verificado por hash de HEAD y árbol limpio
  async rewind(proyectoId: string, wsId: string, hasta: string): Promise<EstadoWorkspace> {
    const objetivo = this.validarReferencia(hasta);
    const reset = await this.git(proyectoId, wsId, `reset --hard ${objetivo}`);
    if (reset.codigo !== 0) throw new Error(`git reset falló: ${reset.salidaError}`);
    await this.git(proyectoId, wsId, 'clean -fd');
    const estado = await this.estado(proyectoId, wsId);
    if (estado.head !== objetivo || !estado.limpio) {
      throw new Error(`El rewind no fue exacto: head=${estado.head} limpio=${estado.limpio}`);
    }
    return estado;
  }

  async estado(proyectoId: string, wsId: string): Promise<EstadoWorkspace> {
    const head = (await this.git(proyectoId, wsId, 'rev-parse HEAD')).salida.trim();
    const pendientes = (await this.git(proyectoId, wsId, 'status --porcelain')).salida.trim();
    return { head, limpio: pendientes.length === 0, pendientes };
  }
}
