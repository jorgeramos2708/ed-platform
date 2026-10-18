import { Logger } from '@nestjs/common';
import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsResponse,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, WebSocket } from 'ws';
import { Client } from 'ssh2';
import { DataSource } from 'typeorm';
import { ServidoresService } from './servidores.service';
import { SecretosService } from '../secretos/secretos.service';
import { SesionTerminal } from '../db/sesion-terminal.entity';

interface SesionActiva {
  sesionId: string;
  ssh: Client;
  stream: import('ssh2').ClientChannel;
}

// F4-3: terminal interactiva — puente WebSocket ↔ SSH PTY (montaje validado en el spike S2/ADR-0009).
// Autenticación por JWT en la query; permiso 'terminal' verificado al abrir; la sesión queda
// auditada (abierta/cerrada) según el compromiso 5 de trazabilidad.
@WebSocketGateway(undefined, { path: '/api/terminal' })
export class TerminalGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TerminalGateway.name);
  private readonly activas = new Map<WebSocket, SesionActiva>();

  constructor(
    private readonly jwt: JwtService,
    private readonly servidores: ServidoresService,
    private readonly secretos: SecretosService,
    private readonly dataSource: DataSource,
  ) {}

  handleConnection(cliente: WebSocket): void {
    this.logger.log('WS conexión recibida');
    // autenticación: ?token=<JWT> en la URL de conexión
    const url = (cliente as unknown as { url?: string }).url ?? '';
    const token = new URL(url, 'http://local').searchParams.get('token');
    this.logger.log(`token presente: ${Boolean(token)}`);
    if (!token) {
      cliente.close(4001, 'sin token');
      return;
    }
    try {
      const payload = this.jwt.verify(token) as { sub: string };
      (cliente as unknown as { usuarioId?: string }).usuarioId = payload.sub;
    } catch {
      cliente.close(4001, 'token inválido');
    }
  }

  handleDisconnect(cliente: WebSocket): void {
    const sesion = this.activas.get(cliente);
    if (sesion) {
      sesion.ssh.end();
      this.activas.delete(cliente);
      void this.cerrarSesion(sesion.sesionId);
      this.logger.log(`sesión ${sesion.sesionId} cerrada (desconexión)`);
    }
  }

  @SubscribeMessage('conectar')
  async conectar(cliente: WebSocket, dto: { servidorId: string }): Promise<WsResponse<unknown>> {
    this.logger.log(`conectar recibido para ${dto?.servidorId}`);
    const usuarioId = (cliente as unknown as { usuarioId?: string }).usuarioId;
    if (!usuarioId) return { event: 'error', data: { mensaje: 'no autenticado' } };
    try {
      // permiso 'terminal' verificado ANTES de abrir la PTY (matriz)
      await this.servidores.exigirPermiso(usuarioId, dto.servidorId, 'terminal');
      const servidor = await this.servidores.obtener(dto.servidorId);
      const credencial = await this.secretos.usarPorId(servidor.credencialId);

      // sesión auditada: abierta
      const sesionRepo = this.dataSource.getRepository(SesionTerminal);
      const sesion = await sesionRepo.save(
        sesionRepo.create({ usuarioId, servidorId: dto.servidorId }),
      );

      const ssh = new Client();
      ssh
        .on('ready', () => {
          ssh.shell({ term: 'xterm-256color' }, (err: Error | undefined, stream: import('ssh2').ClientChannel) => {
            if (err) {
              cliente.send(JSON.stringify({ event: 'error', data: { mensaje: err.message } }));
              return;
            }
            this.activas.set(cliente, { sesionId: sesion.id, ssh, stream });
            cliente.send(JSON.stringify({ event: 'conectado', data: { sesionId: sesion.id } }));
            stream.on('data', (d: Buffer) => {
              if (cliente.readyState === WebSocket.OPEN) {
                cliente.send(JSON.stringify({ event: 'datos', data: { contenido: d.toString('utf8') } }));
              }
            });
            stream.stderr.on('data', (d: Buffer) => {
              if (cliente.readyState === WebSocket.OPEN) {
                cliente.send(JSON.stringify({ event: 'datos', data: { contenido: d.toString('utf8') } }));
              }
            });
            stream.on('close', () => {
              if (cliente.readyState === WebSocket.OPEN) {
                cliente.send(JSON.stringify({ event: 'cerrado', data: {} }));
                cliente.close(1000, 'sesión ssh cerrada');
              }
              void this.cerrarSesion(sesion.id);
            });
          });
        })
        .on('error', (e: Error) => {
          cliente.send(JSON.stringify({ event: 'error', data: { mensaje: `SSH: ${e.message}` } }));
        })
        .connect({
          host: servidor.host,
          port: servidor.puerto,
          username: servidor.usuarioSsh,
          readyTimeout: 15000,
          ...(credencial.valor.includes('PRIVATE KEY')
            ? { privateKey: credencial.valor }
            : { password: credencial.valor }),
        });
      return { event: 'conectando', data: { sesionId: sesion.id } };
    } catch (e) {
      return { event: 'error', data: { mensaje: (e as Error).message } };
    }
  }

  // la entrada del teclado se escribe en la PTY de la sesión asociada a ESTE websocket
  @SubscribeMessage('escribir')
  escribir(cliente: WebSocket, dto: { datos: string }): void {
    const sesion = this.activas.get(cliente);
    if (sesion) sesion.stream.write(dto.datos);
  }

  @SubscribeMessage('redimensionar')
  redimensionar(cliente: WebSocket, dto: { cols: number; filas: number }): void {
    const sesion = this.activas.get(cliente);
    if (sesion) sesion.stream.setWindow(dto.filas, dto.cols, 0, 0);
  }

  private async cerrarSesion(sesionId: string): Promise<void> {
    await this.dataSource
      .getRepository(SesionTerminal)
      .update({ id: sesionId }, { cerradaEn: new Date() });
  }

  // identidad de sesión para logs (sin secretos)
}
