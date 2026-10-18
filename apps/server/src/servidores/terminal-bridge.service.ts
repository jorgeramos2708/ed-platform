import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Server as HttpServer, IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { Client } from 'ssh2';
import { JwtService } from '@nestjs/jwt';
import { ServidoresService } from './servidores.service';
import { SecretosService } from '../secretos/secretos.service';
import { SesionTerminal } from '../db/sesion-terminal.entity';

// F4-3: terminal interactiva — puente WebSocket ↔ SSH PTY con el patrón validado en el spike
// S2 (ADR-0009): ws plano enganchado al HTTP server (sin magia de adaptadores), autenticación
// por JWT en la query, permiso 'terminal' verificado al abrir, sesión auditada abierta/cerrada.
@Injectable()
export class TerminalBridgeService implements OnModuleDestroy {
  private readonly logger = new Logger(TerminalBridgeService.name);
  private wss?: WebSocketServer;
  private readonly sesiones = new Map<WebSocket, { sesionId: string; ssh: Client; stream: import('ssh2').ClientChannel }>();

  constructor(
    private readonly jwt: JwtService,
    private readonly servidores: ServidoresService,
    private readonly secretos: SecretosService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // Engancha el upgrade al HTTP server de la app (path /api/terminal). Idempotente.
  registrarEn(servidorHttp: HttpServer): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({ noServer: true });
    servidorHttp.on('upgrade', (req: IncomingMessage, socket: import('node:net').Socket, head: Buffer) => {
      const url = req.url ?? '';
      if (!url.startsWith('/api/terminal')) return; // otros upgrades: se ignoran (v1 no hay más)
      const token = new URL(url, 'http://local').searchParams.get('token');
      let usuarioId = '';
      try {
        usuarioId = (this.jwt.verify(token ?? '') as { sub: string }).sub;
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.wss!.emit('connection', ws, req, usuarioId);
      });
    });
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage, usuarioId: string) => {
      void this.manejarConexion(ws, usuarioId);
    });
  }

  onModuleDestroy(): void {
    for (const [, sesion] of this.sesiones) sesion.ssh.end();
    this.wss?.close();
  }

  private async manejarConexion(ws: WebSocket, usuarioId: string): Promise<void> {
    ws.on('message', (d: Buffer) => {
      void this.procesarMensaje(ws, usuarioId, d.toString('utf8'));
    });
    ws.on('close', () => {
      const sesion = this.sesiones.get(ws);
      if (sesion) {
        sesion.ssh.end();
        this.sesiones.delete(ws);
        void this.cerrarSesion(sesion.sesionId);
      }
    });
  }

  private async procesarMensaje(ws: WebSocket, usuarioId: string, crudo: string): Promise<void> {
    console.log(`[bridge] mensaje crudo: ${crudo.slice(0, 80)}`);
    let mensaje: { tipo: string; servidorId?: string; datos?: string; cols?: number; filas?: number };
    try {
      mensaje = JSON.parse(crudo);
    } catch {
      return; // mensaje ilegible: ignorado
    }
    switch (mensaje.tipo) {
      case 'conectar':
        await this.abrirSesion(ws, usuarioId, mensaje.servidorId ?? '');
        break;
      case 'entrada': {
        const sesion = this.sesiones.get(ws);
        this.logger.warn(`entrada recibida: sesion=${sesion ? "si" : "NO"}, datos=${JSON.stringify(mensaje.datos)}`);
        sesion?.stream.write(mensaje.datos ?? '');
        break;
      }
      case 'redimensionar':
        this.sesiones.get(ws)?.stream.setWindow(mensaje.filas ?? 24, mensaje.cols ?? 80, 0, 0);
        break;
      default:
        break; // tipos desconocidos: ignorados
    }
  }

  private async abrirSesion(ws: WebSocket, usuarioId: string, servidorId: string): Promise<void> {
    try {
      await this.servidores.exigirPermiso(usuarioId, servidorId, 'terminal');
      const servidor = await this.servidores.obtener(servidorId);
      const credencial = await this.secretos.usarPorId(servidor.credencialId);

      const sesionRepo = this.dataSource.getRepository(SesionTerminal);
      const sesion = await sesionRepo.save(
        sesionRepo.create({ usuarioId, servidorId }),
      );
      this.enviar(ws, 'conectando', { sesionId: sesion.id });

      const ssh = new Client();
      ssh
        .on('ready', () => {
          ssh.shell({ term: 'xterm-256color' }, (err, stream) => {
            if (err) {
              this.enviar(ws, 'error', { mensaje: err.message });
              return;
            }
            this.sesiones.set(ws, { sesionId: sesion.id, ssh, stream });
            this.enviar(ws, 'conectado', { sesionId: sesion.id });
            stream.on('data', (d: Buffer) => {
              this.logger.warn(`PTY->ws chunk: ${JSON.stringify(d.toString('utf8').slice(0, 60))}`);
              this.enviar(ws, 'datos', { contenido: d.toString('utf8') });
            });
            stream.stderr.on('data', (d: Buffer) => this.enviar(ws, 'datos', { contenido: d.toString('utf8') }));
            stream.on('close', () => {
              this.sesiones.delete(ws);
              void this.cerrarSesion(sesion.id);
              this.enviar(ws, 'cerrado', {});
              ws.close(1000, 'sesión ssh cerrada');
            });
          });
        })
        .on('error', (e) => this.enviar(ws, 'error', { mensaje: `SSH: ${e.message}` }))
        .connect({
          host: servidor.host,
          port: servidor.puerto,
          username: servidor.usuarioSsh,
          readyTimeout: 15000,
          ...(credencial.valor.includes('PRIVATE KEY')
            ? { privateKey: credencial.valor }
            : { password: credencial.valor }),
        });
    } catch (e) {
      this.enviar(ws, 'error', { mensaje: (e as Error).message });
    }
  }

  private async cerrarSesion(sesionId: string): Promise<void> {
    await this.dataSource.getRepository(SesionTerminal).update({ id: sesionId }, { cerradaEn: new Date() });
  }

  private enviar(ws: WebSocket, tipo: string, data: Record<string, unknown>): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ tipo, ...data }));
  }
}
