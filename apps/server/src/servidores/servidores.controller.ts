import { Body, Controller, Delete, Get, HttpCode, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ActorTipo } from '../db/auditoria.entity';
import { RolUsuario } from '../db/usuario.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ServidoresService } from './servidores.service';
import { SshService } from './ssh.service';

// Fase 4 — matriz: gestionar servidores/permisos → admin; listar → autenticado (filtrado por permisos);
// ejecutar comandos → admin o desarrollador CON permiso 'ejecutar' en ese servidor (verifica el servicio)
@Controller('api/servidores')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServidoresController {
  constructor(
    private readonly servidores: ServidoresService,
    private readonly ssh: SshService,
  ) {}

  @Post()
  @HttpCode(201)
  @Roles(RolUsuario.Admin)
  crear(
    @Body() dto: { nombre: string; host: string; puerto: number; credencialId: string; usuarioSsh?: string },
    @Request() req: { usuario: { sub: string } },
  ) {
    return this.servidores.crear(dto, { id: req.usuario.sub, tipo: ActorTipo.Usuario });
  }

  // Catálogo completo: solo admin (los demás usuarios ven el suyo vía /mis-servidores)
  @Get()
  @Roles(RolUsuario.Admin)
  listarTodos() {
    return this.servidores.listarTodos();
  }

  // Los servidores a los que el usuario actual tiene acceso, con sus acciones
  @Get('mis-servidores')
  listarMios(@Request() req: { usuario: { sub: string } }) {
    return this.servidores.listarPara(req.usuario.sub);
  }

  @Delete(':id')
  @Roles(RolUsuario.Admin)
  async eliminar(@Param('id') id: string, @Request() req: { usuario: { sub: string } }) {
    await this.servidores.eliminar(id, { id: req.usuario.sub, tipo: ActorTipo.Usuario });
    return { eliminado: true };
  }

  @Post(':id/permisos')
  @HttpCode(201)
  @Roles(RolUsuario.Admin)
  concederPermiso(
    @Param('id') id: string,
    @Body() dto: { usuarioId: string; acciones: string[] },
    @Request() req: { usuario: { sub: string } },
  ) {
    return this.servidores.concederPermiso(id, dto.usuarioId, dto.acciones, {
      id: req.usuario.sub,
      tipo: ActorTipo.Usuario,
    });
  }

  @Delete(':id/permisos/:usuarioId')
  @Roles(RolUsuario.Admin)
  async revocarPermiso(
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
    @Request() req: { usuario: { sub: string } },
  ) {
    await this.servidores.revocarPermiso(id, usuarioId, { id: req.usuario.sub, tipo: ActorTipo.Usuario });
    return { revocado: true };
  }

  // Ejecución de comandos one-shot (la terminal interactiva va por WebSocket en F4-3)
  @Post(':id/comandos')
  @HttpCode(200)
  @Roles(RolUsuario.Admin, RolUsuario.Desarrollador)
  async ejecutarComando(
    @Param('id') id: string,
    @Body() dto: { comando: string },
    @Request() req: { usuario: { sub: string } },
  ): Promise<{ codigo: number; salida: string; salidaError: string }> {
    return this.ssh.ejecutarComando(req.usuario.sub, id, dto.comando);
  }

  // Diagnóstico (F4-5): estado vivo/muerto del servidor con latencia
  @Get(':id/estado')
  @HttpCode(200)
  @Roles(RolUsuario.Admin, RolUsuario.Desarrollador)
  async estado(@Param('id') id: string, @Request() req: { usuario: { sub: string } }) {
    return this.ssh.estado(req.usuario.sub, id);
  }
}
