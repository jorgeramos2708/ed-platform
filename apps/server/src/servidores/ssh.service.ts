import { Injectable } from '@nestjs/common';
import { Client } from 'ssh2';
import { readFileSync } from 'node:fs';
import { ServidoresService } from '../servidores/servidores.service';
import { SecretosService } from '../secretos/secretos.service';

export interface ResultadoSsh {
  codigo: number;
  salida: string;
  salidaError: string;
}

export interface ServidorSsh {
  host: string;
  puerto: number;
  usuarioSsh: string;
}

// F4-2: ejecución SSH one-shot en un servidor AUTORIZADO (permiso 'ejecutar' verificado antes).
// La credencial vive cifrada en el vault (clave privada o contraseña) y se descifra just-in-time:
// nunca en disco, nunca en logs (Sanitizador), jamás en la respuesta HTTP.
// El perfil de red del contenedor API ya tiene salida (bridge) — el SSH es trafico legitimo de gestión.
@Injectable()
export class SshService {
  constructor(
    private readonly servidores: ServidoresService,
    private readonly secretos: SecretosService,
  ) {}

  async ejecutarComando(
    usuarioId: string,
    servidorId: string,
    comando: string,
  ): Promise<ResultadoSsh> {
    await this.servidores.exigirPermiso(usuarioId, servidorId, 'ejecutar');
    const servidor = await this.servidores.obtener(servidorId);
    const credencial = await this.secretos.usarPorId(servidor.credencialId);
    return this.conectarYExec(
      { host: servidor.host, puerto: servidor.puerto, usuarioSsh: servidor.usuarioSsh },
      credencial.valor,
      comando,
    );
  }

  // F4-5 (diagnóstico): estado del servidor — un echo con timeout corto
  async estado(
    usuarioId: string,
    servidorId: string,
  ): Promise<{ vivo: boolean; latenciaMs: number | null; detalle: string }> {
    const inicio = Date.now();
    try {
      await this.ejecutarComando(usuarioId, servidorId, 'echo ok');
      return { vivo: true, latenciaMs: Date.now() - inicio, detalle: 'responde' };
    } catch (e) {
      return { vivo: false, latenciaMs: null, detalle: (e as Error).message };
    }
  }

  // El montaje SSH del spike S2 (ADR-0009, verificado): conexión con clave o contraseña + exec.
  private async conectarYExec(
    servidor: ServidorSsh,
    credencialValor: string,
    comando: string,
  ): Promise<ResultadoSsh> {
    return new Promise((resolver, rechazar) => {
      const conn = new Client();
      const fin = (r: ResultadoSsh | Error) => {
        conn.end();
        if (r instanceof Error) rechazar(r);
        else resolver(r);
      };
      const temporizador = setTimeout(() => {
        fin(new Error(`SSH timeout conectando a ${servidor.host}:${servidor.puerto}`));
      }, 20000);

      conn
        .on('ready', () => {
          conn.exec(comando, (err, stream) => {
            if (err) {
              clearTimeout(temporizador);
              fin(err);
              return;
            }
            let salida = '';
            let salidaError = '';
            let codigo = -1;
            stream
              .on('close', (code: number) => {
                clearTimeout(temporizador);
                fin({ codigo: code ?? codigo, salida, salidaError });
              })
              .on('data', (d: Buffer) => {
                salida += d.toString('utf8');
              })
              .stderr.on('data', (d: Buffer) => {
                salidaError += d.toString('utf8');
              });
          });
        })
        .on('error', (e) => {
          clearTimeout(temporizador);
          fin(e);
        })
        .connect({
          host: servidor.host,
          port: servidor.puerto,
          username: servidor.usuarioSsh,
          readyTimeout: 15000,
          ...(credencialValor.includes('PRIVATE KEY')
            ? { privateKey: credencialValor }
            : { password: credencialValor }),
        });
    });
  }
}

export function leerClavePrivada(ruta: string): string {
  return readFileSync(ruta, 'utf8');
}
