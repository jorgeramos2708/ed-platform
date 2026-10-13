import { Body, Controller, Get, HttpCode, Post, Request, UseGuards } from '@nestjs/common';
import { ActorTipo } from '../db/auditoria.entity';
import { RolUsuario } from '../db/usuario.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProyectosService } from './proyectos.service';

@Controller('api/proyectos')
export class ProyectosController {
  constructor(private readonly proyectos: ProyectosService) {}

  // Matriz: crear proyecto → admin o desarrollador; espectador → 403 auditado
  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.Admin, RolUsuario.Desarrollador)
  crear(
    @Body() dto: { nombre: string; repoUrl?: string },
    @Request() req: { usuario: { sub: string } },
  ) {
    return this.proyectos.crear(dto, { id: req.usuario.sub, tipo: ActorTipo.Usuario });
  }

  // Listar: cualquier usuario autenticado (espectador incluido — matriz)
  @Get()
  @UseGuards(JwtAuthGuard)
  listar() {
    return this.proyectos.listar();
  }
}
