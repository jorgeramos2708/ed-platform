import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RolUsuario } from '../db/usuario.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CheckpointsService } from './checkpoints.service';

// Matriz: checkpoints/rewind de un workspace → admin o desarrollador
@Controller('api/proyectos/:proyectoId/workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.Admin, RolUsuario.Desarrollador)
export class CheckpointsController {
  constructor(private readonly checkpoints: CheckpointsService) {}

  @Post('checkpoints')
  @HttpCode(201)
  crear(
    @Param('proyectoId') proyectoId: string,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: { mensaje: string },
  ) {
    return this.checkpoints.crear(proyectoId, workspaceId, dto.mensaje ?? 'checkpoint');
  }

  // Cambios pendientes (working tree vs último checkpoint) — lo que se revisa para aceptar/descartar
  @Get('diff')
  diffPendiente(
    @Param('proyectoId') proyectoId: string,
    @Param('workspaceId') workspaceId: string,
    @Query('desde') desde?: string,
  ) {
    return desde
      ? { diff: this.checkpoints.diff(proyectoId, workspaceId, desde) }
      : { diff: this.checkpoints.diffPendiente(proyectoId, workspaceId) };
  }

  @Post('rewind')
  @HttpCode(200)
  rewind(
    @Param('proyectoId') proyectoId: string,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: { hasta: string },
  ) {
    return this.checkpoints.rewind(proyectoId, workspaceId, dto.hasta);
  }

  @Get('estado')
  estado(
    @Param('proyectoId') proyectoId: string,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.checkpoints.estado(proyectoId, workspaceId);
  }
}
