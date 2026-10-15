import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { RolUsuario } from '../db/usuario.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { WorkspacesService } from './workspaces.service';

// Matriz E06: crear workspaces y ejecutar comandos en ellos → admin o desarrollador
@Controller('api/proyectos/:proyectoId/workspaces')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.Admin, RolUsuario.Desarrollador)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  @HttpCode(201)
  crear(@Param('proyectoId') proyectoId: string) {
    return this.workspaces.crear(proyectoId);
  }

  @Post(':workspaceId/comandos')
  ejecutarComando(
    @Param('proyectoId') proyectoId: string,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: { comando: string },
  ) {
    return this.workspaces.ejecutar(proyectoId, workspaceId, dto.comando);
  }
}
