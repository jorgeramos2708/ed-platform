import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { RolUsuario } from '../db/usuario.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TrabajosService } from './trabajos.service';

// Matriz E04: lanzar trabajos → admin/desarrollador; listar → cualquier autenticado
@Controller('api/trabajos')
@UseGuards(JwtAuthGuard)
export class TrabajosController {
  constructor(private readonly trabajos: TrabajosService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(RolesGuard)
  @Roles(RolUsuario.Admin, RolUsuario.Desarrollador)
  encolar(@Body() dto: { tipo: string; payload: Record<string, unknown> }) {
    return this.trabajos.encolar(dto.tipo, dto.payload ?? {});
  }

  @Get()
  listar() {
    return this.trabajos.listar();
  }
}
