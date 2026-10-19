import { Body, Controller, Get, HttpCode, Param, Post, Request, UseGuards } from '@nestjs/common';
import { RolUsuario } from '../db/usuario.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CiService } from './ci.service';

// F5-3 — matriz: disparar corridas → admin o desarrollador; consultar corridas/logs/artefactos →
// cualquier usuario autenticado (espectador incluido: solo lectura)
@Controller('api')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CiController {
  constructor(private readonly ci: CiService) {}

  // Dispara la corrida: responde 202 inmediato (la ejecución va por la cola, en background)
  @Post('proyectos/:proyectoId/corridas')
  @HttpCode(202)
  @Roles(RolUsuario.Admin, RolUsuario.Desarrollador)
  async disparar(
    @Param('proyectoId') proyectoId: string,
    @Body() dto: { commitSha?: string },
  ) {
    const corrida = await this.ci.disparar(proyectoId, dto.commitSha);
    return {
      id: corrida.id,
      estado: corrida.estado,
      commitSha: corrida.commitSha || null,
      mensaje: 'Corrida encolada — consulta su estado en GET /corridas/:id',
    };
  }

  @Get('proyectos/:proyectoId/corridas')
  listar(@Param('proyectoId') proyectoId: string) {
    return this.ci.listarDelProyecto(proyectoId);
  }

  @Get('corridas/:corridaId')
  async obtener(@Param('corridaId') corridaId: string) {
    const { corrida, etapas } = await this.ci.obtener(corridaId);
    return { ...corrida, etapas };
  }

  // El contenido del artefacto en base64 (descarga)
  @Get('artefactos/:artefactoId/contenido')
  async contenidoArtefacto(
    @Param('artefactoId') artefactoId: string,
  ): Promise<{ id: string; etiqueta: string; digest: string; contenidoBase64: string }> {
    return this.ci.contenidoArtefacto(artefactoId);
  }
}
