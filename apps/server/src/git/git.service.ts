import { Injectable } from '@nestjs/common';
import { ResultadoComando, WorkspacesService } from '../workspaces/workspaces.service';

// Fase 3 (Git y remotos): el workspace de un proyecto con remoto nace como CLON del origen.
// La credencial (PAT) viaja por GIT_ASKPASS leyendo $GIT_TOKEN del env del contenedor efímero:
// jamás en el comando del shell, jamás en .git/config, jamás en logs (redactados por LoggerSeguro).
// El token SÍ transita en los argumentos del `docker run` del host (-e GIT_TOKEN=...) — superficie
// momentánea documentada (el API ya posee el socket de Docker; residual aceptado en modelo-amenazas).

export interface ResultadoPush extends ResultadoComando {
  rechazado?: boolean; // push no-fast-forward: el origen avanzó — NO es un fallo del sistema
}

export interface ResultadoPull extends ResultadoComando {
  conflicto?: boolean; // rebase con conflictos — se abortó y el workspace quedó en el estado previo
  archivosConflicto?: string[]; // detectados en la salida del rebase antes de abortar
}

export interface EntradaHistorial {
  hash: string;
  asunto: string;
}

// Prefijo compartido: prepara el askpass en el tmpfs del contenedor y desactiva prompts de TTY.
// El token vive SOLO en el env del contenedor; el comando del shell solo referencia $GIT_TOKEN.
function askpassPrefix(token?: string): { prefijo: string; env: Record<string, string> } {
  if (!token) return { prefijo: 'GIT_TERMINAL_PROMPT=0 ', env: {} };
  return {
    prefijo:
      `printf '%s\\n' '#!/bin/sh' '[ "$1" = "Password" ] && echo "$GIT_TOKEN" || echo x' > /tmp/askpass.sh && chmod +x /tmp/askpass.sh && ` +
      'GIT_ASKPASS=/tmp/askpass.sh GIT_TERMINAL_PROMPT=0 ',
    env: { GIT_TOKEN: token },
  };
}

export function construirComandoClonar(
  url: string,
  rama?: string,
  token?: string,
): { comando: string; env: Record<string, string> } {
  const ramaValida = rama && /^[A-Za-z0-9._/-]{1,64}$/.test(rama) ? rama : undefined;
  const { prefijo, env } = askpassPrefix(token);
  const comando = `${prefijo}git clone ${ramaValida ? `-b ${ramaValida} ` : ''}${url} /workspace`;
  return { comando, env };
}

export function construirComandoPush(token?: string): { comando: string; env: Record<string, string> } {
  const { prefijo, env } = askpassPrefix(token);
  return { comando: `${prefijo}git push origin HEAD`, env };
}

export function construirComandoPull(rama: string, token?: string): { comando: string; env: Record<string, string> } {
  const { prefijo, env } = askpassPrefix(token);
  // --rebase: historia lineal; si hay conflicto el servicio lo detecta y aborta (trabajo intacto)
  return { comando: `${prefijo}git pull --rebase origin ${rama}`, env };
}

const RAMA_RE = /^[A-Za-z0-9._/-]{1,64}$/;

@Injectable()
export class GitService {
  constructor(private readonly workspaces: WorkspacesService) {}

  private bindDeRemotosDePrueba(): string[] {
    // Afordancia SOLO de pruebas: bind extra cuando EDP_GIT_REMOTOS_DIR está definido.
    // Lecto-escritura: push escribe en los bare repos de prueba. En producción la env no existe
    // y el contenedor de tarea conserva ÚNICAMENTE el bind del workspace (ADR-0006 intacto).
    const dir = process.env.EDP_GIT_REMOTOS_DIR;
    return dir ? [`${dir}:/remotos`] : [];
  }

  private async gitRemoto(
    proyectoId: string,
    workspaceId: string,
    comando: string,
    env: Record<string, string>,
    timeoutMs = 240000,
  ): Promise<ResultadoComando> {
    // redPuente: clone/push/pull contra remotos REALES necesitan salida a internet (https).
    // Son comandos fijos construidos por este servicio con URL/rama validadas — el perfil
    // sin red (S1) queda reservado a los comandos arbitrarios de los planes de la IA.
    return this.workspaces.ejecutar(proyectoId, workspaceId, comando, {
      extraBinds: this.bindDeRemotosDePrueba(),
      env,
      timeoutMs,
      redPuente: true,
    });
  }

  async clonar(
    proyectoId: string,
    workspaceId: string,
    dto: { url: string; rama?: string; token?: string },
  ): Promise<ResultadoComando> {
    if (dto.url.startsWith('file://') && !process.env.EDP_GIT_REMOTOS_DIR) {
      throw new Error('file:// solo está permitido en pruebas (EDP_GIT_REMOTOS_DIR definido)');
    }
    const { comando, env } = construirComandoClonar(dto.url, dto.rama, dto.token);
    const r = await this.gitRemoto(proyectoId, workspaceId, comando, env);
    if (r.codigo !== 0) {
      // La salida puede contener la URL pero JAMÁS el token (no está en el comando)
      throw new Error(`git clone falló: ${r.salidaError || r.salida}`);
    }
    // Identidad del workspace para los commits posteriores (pull/push y checkpoints)
    await this.workspaces.ejecutar(
      proyectoId,
      workspaceId,
      'git config --local core.autocrlf false && git config --local user.email workspace@edp && git config --local user.name workspace',
    );
    return r;
  }

  // Publica HEAD en la rama indicada. Si el origen avanzó (no-fast-forward), devuelve
  // rechazado:true SIN tocar el workspace — el trabajo local permanece intacto.
  async push(
    proyectoId: string,
    workspaceId: string,
    dto: { rama: string; token?: string },
  ): Promise<ResultadoPush> {
    if (!RAMA_RE.test(dto.rama)) throw new Error(`Nombre de rama inválido: ${dto.rama}`);
    const { comando, env } = construirComandoPush(dto.token);
    const r = await this.gitRemoto(proyectoId, workspaceId, `${comando}:${dto.rama}`, env);
    if (r.codigo === 0) return { ...r, rechazado: false };
    const salida = `${r.salidaError}${r.salida}`;
    if (/rejected|non-fast-forward|fetch first/i.test(salida)) {
      return { ...r, rechazado: true };
    }
    throw new Error(`git push falló: ${salida}`);
  }

  // Integra el avance del origen con --rebase. Si hay conflicto: `rebase --abort` inmediato
  // (el workspace vuelve EXACTAMENTE al estado previo, trabajo intacto) y conflicto:true con
  // los archivos en conflicto detectados.
  async pull(
    proyectoId: string,
    workspaceId: string,
    dto: { rama: string; token?: string },
  ): Promise<ResultadoPull> {
    if (!RAMA_RE.test(dto.rama)) throw new Error(`Nombre de rama inválido: ${dto.rama}`);
    const { comando, env } = construirComandoPull(dto.rama, dto.token);
    const r = await this.gitRemoto(proyectoId, workspaceId, comando, env);
    if (r.codigo === 0) return { ...r, conflicto: false };
    const salida = `${r.salidaError}${r.salida}`;
    if (/CONFLICT|could not apply/i.test(salida)) {
      const archivosConflicto = [
        ...salida.matchAll(/CONFLICT \((?:content|modify\/delete|add\/add)\): Merge conflict in (.+)/g),
      ].map((m) => m[1].trim());
      await this.workspaces.ejecutar(proyectoId, workspaceId, 'git rebase --abort');
      return { ...r, conflicto: true, archivosConflicto };
    }
    throw new Error(`git pull falló: ${salida}`);
  }

  async historial(proyectoId: string, workspaceId: string, limite = 20): Promise<EntradaHistorial[]> {
    const n = Math.min(Math.max(limite, 1), 100);
    const r = await this.workspaces.ejecutar(
      proyectoId,
      workspaceId,
      `git log --pretty=format:%H%x09%s -n ${n}`,
    );
    if (r.codigo !== 0) throw new Error(`git log falló: ${r.salidaError}`);
    return r.salida
      .split('\n')
      .filter((linea) => linea.trim())
      .map((linea) => {
        const [hash, ...resto] = linea.split('\t');
        return { hash, asunto: resto.join('\t') };
      });
  }

  async ramas(proyectoId: string, workspaceId: string): Promise<string[]> {
    // Las comillas protegen los paréntesis del shell del contenedor (sh -c)
    const r = await this.workspaces.ejecutar(
      proyectoId,
      workspaceId,
      "git branch --format='%(refname:short)'",
    );
    if (r.codigo !== 0) throw new Error(`git branch falló: ${r.salidaError}`);
    return r.salida.split('\n').map((l) => l.trim()).filter(Boolean);
  }

  // F3-4: hash del extremo de la rama en el ORIGEN (sin workspace — contenedor efímero con red
  // puente: los comandos git contra remotos REALES necesitan salida; son comandos fijos con
  // URL/rama validadas, nunca ejecución arbitraria — el perfil sin red queda para tareas S1)
  async remotoHead(
    proyectoId: string,
    url: string,
    rama: string,
    token?: string,
  ): Promise<string> {
    if (!RAMA_RE.test(rama)) throw new Error(`Nombre de rama inválido: ${rama}`);
    if (url.startsWith('file://') && !process.env.EDP_GIT_REMOTOS_DIR) {
      throw new Error('file:// solo está permitido en pruebas (EDP_GIT_REMOTOS_DIR definido)');
    }
    const { prefijo, env } = askpassPrefix(token);
    const comando = `${prefijo}git ls-remote ${url} refs/heads/${rama}`;
    const r = await this.workspaces.ejecutarEfimero(comando, {
      env,
      extraBinds: this.bindDeRemotosDePrueba(),
      timeoutMs: 120000,
    });
    if (r.codigo !== 0) throw new Error(`git ls-remote falló: ${r.salidaError || r.salida}`);
    const hash = r.salida.split('\t')[0]?.trim();
    if (!/^[0-9a-f]{40}$/.test(hash)) throw new Error(`ls-remote no devolvió un hash válido para ${rama}`);
    return hash;
  }
}
