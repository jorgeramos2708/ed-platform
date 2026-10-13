import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { RolUsuario } from '../db/usuario.entity';
import { ActorTipo } from '../db/auditoria.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SecretosService } from './secretos.service';

// Matriz E03: crear/rotar/listar secretos → SOLO admin (usar es just-in-time interno, sin endpoint)
@Controller('api/secretos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.Admin)
export class SecretosController {
  constructor(private readonly secretos: SecretosService) {}

  @Post()
  crear(
    @Body() dto: { nombre: string; valor: string; proyectoId?: string },
    @Request() req: { usuario: { sub: string } },
  ) {
    return this.secretos.crear(dto, { id: req.usuario.sub, tipo: ActorTipo.Usuario });
  }

  // Metadatos solamente — NUNCA valores ni material cifrado
  @Get()
  listar() {
    return this.secretos.listar();
  }

  @Post(':id/rotar')
  rotar(
    @Param('id') id: string,
    @Body() dto: { nuevoValor: string },
    @Request() req: { usuario: { sub: string } },
  ) {
    return this.secretos.rotar(id, dto.nuevoValor, { id: req.usuario.sub, tipo: ActorTipo.Usuario });
  }
}
