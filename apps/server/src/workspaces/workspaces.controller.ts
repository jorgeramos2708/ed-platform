import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RolUsuario } from '../db/usuario.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SecretosService } from '../secretos/secretos.service';
import { ProyectosService } from '../proyectos/proyectos.service';
import { WorkspacesService } from './workspaces.service';
import { GitService } from '../git/git.service';

// Matriz E06: crear workspaces y ejecutar comandos en ellos → admin o desarrollador
@Controller('api/proyectos/:proyectoId/workspaces')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.Admin, RolUsuario.Desarrollador)
export class WorkspacesController {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly git: GitService,
    private readonly proyectos: ProyectosService,
    private readonly secretos: SecretosService,
  ) {}

  // Fase 3: si el proyecto tiene remoto, el workspace nace como CLON del origen.
  // El token (PAT) se toma del vault (Secreto 'github-token') si existe; si no, clon público.
  @Post()
  @HttpCode(201)
  async crear(@Param('proyectoId') proyectoId: string) {
    const proyecto = await this.proyectos.obtener(proyectoId);
    const ws = await this.workspaces.crear(proyectoId, { gitInit: !proyecto.repoUrl });
    if (!proyecto.repoUrl) return { id: ws.id, proyectoId, clonado: false };
    let token: string | undefined;
    try {
      token = (await this.secretos.usarPorNombre('github-token')).valor;
    } catch {
      token = undefined; // sin credencial en el vault: clon público
    }
    await this.git.clonar(proyectoId, ws.id, {
      url: proyecto.repoUrl,
      rama: proyecto.ramaDefault,
      token,
    });
    return { id: ws.id, proyectoId, clonado: true };
  }

  @Post(':workspaceId/comandos')
  ejecutarComando(
    @Param('proyectoId') proyectoId: string,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: { comando: string },
  ) {
    return this.workspaces.ejecutar(proyectoId, workspaceId, dto.comando);
  }

  // Fase 3: sincronización con el remoto — push publica, pull integra (conflictos → informe,
  // el rebase se aborta y el trabajo local permanece). Matriz: admin o desarrollador.
  @Post(':workspaceId/push')
  @HttpCode(200)
  async push(
    @Param('proyectoId') proyectoId: string,
    @Param('workspaceId') workspaceId: string,
  ) {
    const resultado = await this.git.push(proyectoId, workspaceId, {
      rama: await this.ramaDelProyecto(proyectoId),
      token: await this.tokenDelVault(),
    });
    return { ...resultado, rechazado: resultado.rechazado ?? false };
  }

  @Post(':workspaceId/pull')
  @HttpCode(200)
  async pull(
    @Param('proyectoId') proyectoId: string,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.git.pull(proyectoId, workspaceId, {
      rama: await this.ramaDelProyecto(proyectoId),
      token: await this.tokenDelVault(),
    });
  }

  // Lectura del historial: espectador incluido (matriz: solo lectura)
  @Get(':workspaceId/historial')
  historial(
    @Param('proyectoId') proyectoId: string,
    @Param('workspaceId') workspaceId: string,
    @Query('limite') limite?: string,
  ) {
    return this.git.historial(proyectoId, workspaceId, limite ? Number(limite) : 20);
  }

  @Get(':workspaceId/ramas')
  ramas(
    @Param('proyectoId') proyectoId: string,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.git.ramas(proyectoId, workspaceId);
  }

  private async ramaDelProyecto(proyectoId: string): Promise<string> {
    const proyecto = await this.proyectos.obtener(proyectoId);
    return proyecto.ramaDefault || 'main';
  }

  private async tokenDelVault(): Promise<string | undefined> {
    try {
      return (await this.secretos.usarPorNombre('github-token')).valor;
    } catch {
      return undefined; // sin credencial en el vault: remoto público
    }
  }
}
