import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Client, SFTPWrapper } from 'ssh2';
import { ServidoresService } from './servidores.service';
import { SecretosService } from '../secretos/secretos.service';
import { Auditoria, ActorTipo } from '../db/auditoria.entity';

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

// F4: acceso SSH a servidores AUTORIZADOS (permiso verificado antes de cada operación).
// La credencial vive cifrada en el vault (clave privada o contraseña) y se descifra
// just-in-time: nunca en disco, nunca en logs (Sanitizador), jamás en la respuesta HTTP.
@Injectable()
export class SshService {
  constructor(
    private readonly servidores: ServidoresService,
    private readonly secretos: SecretosService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // F4-2: ejecución one-shot de un comando
  async ejecutarComando(usuarioId: string, servidorId: string, comando: string): Promise<ResultadoSsh> {
    await this.servidores.exigirPermiso(usuarioId, servidorId, 'ejecutar');
    const servidor = await this.servidores.obtener(servidorId);
    const credencial = await this.secretos.usarPorId(servidor.credencialId);
    const conn = await this.conectar(
      { host: servidor.host, puerto: servidor.puerto, usuarioSsh: servidor.usuarioSsh },
      credencial.valor,
    );
    try {
      return await new Promise<ResultadoSsh>((resolver, rechazar) => {
        conn.exec(comando, (err, stream) => {
          if (err) {
            rechazar(err);
            return;
          }
          let salida = '';
          let salidaError = '';
          stream
            .on('close', (code: number) => {
              resolver({ codigo: code ?? -1, salida, salidaError });
            })
            .on('data', (d: Buffer) => {
              salida += d.toString('utf8');
            });
          stream.stderr.on('data', (d: Buffer) => {
            salidaError += d.toString('utf8');
          });
        });
      });
    } finally {
      conn.end();
    }
  }

  // F4-4: SFTP — subir un archivo (contenido en memoria; streams grandes quedan P2)
  async subir(
    usuarioId: string,
    servidorId: string,
    rutaRemota: string,
    contenido: Buffer,
  ): Promise<{ ok: true; rutaRemota: string; bytes: number }> {
    await this.servidores.exigirPermiso(usuarioId, servidorId, 'sftp');
    const servidor = await this.servidores.obtener(servidorId);
    const credencial = await this.secretos.usarPorId(servidor.credencialId);
    const conn = await this.conectar(
      { host: servidor.host, puerto: servidor.puerto, usuarioSsh: servidor.usuarioSsh },
      credencial.valor,
    );
    try {
      const sftp = await this.abrirSftp(conn);
      await new Promise<void>((resolver, rechazar) => {
        sftp.writeFile(rutaRemota, contenido, (e2) => {
          if (e2) rechazar(new Error(`sftp writeFile falló: ${e2.message}`));
          else resolver();
        });
      });
      await this.auditar(servidorId, 'servidor.archivo.subir', { rutaRemota, bytes: contenido.length });
      return { ok: true, rutaRemota, bytes: contenido.length };
    } finally {
      conn.end();
    }
  }

  // F4-4: SFTP — descargar un archivo (el contenido vuelve en base64 por la API)
  async descargar(usuarioId: string, servidorId: string, rutaRemota: string): Promise<Buffer> {
    await this.servidores.exigirPermiso(usuarioId, servidorId, 'sftp');
    const servidor = await this.servidores.obtener(servidorId);
    const credencial = await this.secretos.usarPorId(servidor.credencialId);
    const conn = await this.conectar(
      { host: servidor.host, puerto: servidor.puerto, usuarioSsh: servidor.usuarioSsh },
      credencial.valor,
    );
    try {
      const sftp = await this.abrirSftp(conn);
      const datos = await new Promise<Buffer>((resolver, rechazar) => {
        sftp.readFile(rutaRemota, (e2, contenido) => {
          if (e2) rechazar(new Error(`sftp readFile falló: ${e2.message}`));
          else resolver(contenido);
        });
      });
      await this.auditar(servidorId, 'servidor.archivo.descargar', { rutaRemota, bytes: datos.length });
      return datos;
    } finally {
      conn.end();
    }
  }

  // F4-5 (diagnóstico): estado del servidor — un echo con timeout corto
  async estado(usuarioId: string, servidorId: string): Promise<{ vivo: boolean; latenciaMs: number | null; detalle: string }> {
    const inicio = Date.now();
    try {
      await this.ejecutarComando(usuarioId, servidorId, 'echo ok');
      return { vivo: true, latenciaMs: Date.now() - inicio, detalle: 'responde' };
    } catch (e) {
      return { vivo: false, latenciaMs: null, detalle: (e as Error).message };
    }
  }

  // Conexión compartida (exec y sftp): clave privada o contraseña según el valor del vault
  private async conectar(servidor: ServidorSsh, credencialValor: string): Promise<Client> {
    return new Promise((resolver, rechazar) => {
      const conn = new Client();
      const temporizador = setTimeout(() => {
        conn.end();
        rechazar(new Error(`SSH timeout conectando a ${servidor.host}:${servidor.puerto}`));
      }, 20000);
      conn
        .on('ready', () => {
          clearTimeout(temporizador);
          resolver(conn);
        })
        .on('error', (e) => {
          clearTimeout(temporizador);
          rechazar(e);
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

  private abrirSftp(conn: Client): Promise<SFTPWrapper> {
    return new Promise((resolver, rechazar) => {
      conn.sftp((err, sftp) => {
        if (err) rechazar(err);
        else resolver(sftp);
      });
    });
  }

  private async auditar(servidorId: string, accion: string, detalle: Record<string, unknown>): Promise<void> {
    await this.dataSource.getRepository(Auditoria).save(
      this.dataSource.getRepository(Auditoria).create({
        actorId: 'sistema',
        actorTipo: ActorTipo.Sistema,
        accion,
        recursoTipo: 'servidor',
        recursoId: servidorId,
        detalle,
      }),
    );
  }
}
