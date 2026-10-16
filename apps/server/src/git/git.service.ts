import { Injectable } from '@nestjs/common';
import { ResultadoComando, WorkspacesService } from '../workspaces/workspaces.service';

// Fase 3 (Git y remotos): el workspace de un proyecto con remoto nace como CLON del origen.
// La credencial (PAT) viaja por GIT_ASKPASS leyendo $GIT_TOKEN del env del contenedor efímero:
// jamás en el comando del shell, jamás en .git/config, jamás en logs (redactados por LoggerSeguro).
// El token SÍ transita en los argumentos del `docker run` del host (-e GIT_TOKEN=...) — superficie
// momentánea documentada (el API ya posee el socket de Docker; residual aceptado en modelo-amenazas).

export function construirComandoClonar(
  url: string,
  rama?: string,
  token?: string,
): { args: string[]; comando: string; env: Record<string, string> } {
  const ramaValida = rama && /^[A-Za-z0-9._/-]{1,64}$/.test(rama) ? rama : undefined;
  const env: Record<string, string> = {};
  if (token) env.GIT_TOKEN = token;
  const comando =
    (token
      ? `printf '%s\\n' '#!/bin/sh' '[ "$1" = "Password" ] && echo "$GIT_TOKEN" || echo x' > /tmp/askpass.sh && chmod +x /tmp/askpass.sh && `
      : '') +
    `${token ? 'GIT_ASKPASS=/tmp/askpass.sh GIT_TERMINAL_PROMPT=0 ' : 'GIT_TERMINAL_PROMPT=0 '}` +
    `git clone ${ramaValida ? `-b ${ramaValida} ` : ''}${url} /workspace`;
  const args = ['-w', '/workspace'];
  return { args, comando, env };
}

@Injectable()
export class GitService {
  constructor(private readonly workspaces: WorkspacesService) {}

  private bindDeRemotosDePrueba(): string[] {
    const dir = process.env.EDP_GIT_REMOTOS_DIR;
    return dir ? [`${dir}:/remotos:ro`] : [];
  }

  async clonar(
    proyectoId: string,
    workspaceId: string,
    dto: { url: string; rama?: string; token?: string },
  ): Promise<ResultadoComando> {
    if (dto.url.startsWith('file://') && !process.env.EDP_GIT_REMOTOS_DIR) {
      throw new Error('file:// solo está permitido en pruebas (EDP_GIT_REMOTOS_DIR definido)');
    }
    const { args, comando, env } = construirComandoClonar(dto.url, dto.rama, dto.token);
    // GIT_TERMINAL_PROMPT=0 + askpass: si la credencial falla, git aborta (no se cuelga esperando TTY)
    const r = await this.workspaces.ejecutar(proyectoId, workspaceId, comando, {
      extraBinds: this.bindDeRemotosDePrueba(),
      env,
      timeoutMs: 240000,
    });
    void args;
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
}
