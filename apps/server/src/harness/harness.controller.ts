import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import { RolUsuario } from '../db/usuario.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ReglasService } from '../reglas/reglas.service';
import { ChatService } from './chat.service';
import { HarnessService, PlanIA } from './harness.service';
import { MensajeIA } from './proveedor-ia';

// Matriz: chat/plan/ejecutar → admin o desarrollador (espectador solo lectura)
// 503 si no hay proveedores configurados (arranque sin EDP_AI_API_KEY es válido)
// CUIDADO: un método NO puede llamarse igual que una propiedad inyectada (p. ej. 'chat')
@Controller('api/proyectos/:proyectoId/harness')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.Admin, RolUsuario.Desarrollador)
export class HarnessController {
  constructor(
    private readonly servicioHarness: HarnessService,
    private readonly servicioChat: ChatService,
    private readonly reglas: ReglasService,
  ) {}

  // Plan ANTES de ejecutar: la UI muestra el plan y solo llama a /ejecutar tras aprobarlo
  @Post('plan')
  async plan(
    @Param('proyectoId') proyectoId: string,
    @Body() dto: { instruccion: string; limiteTokens?: number },
  ) {
    this.exigirProveedores();
    const reglas = this.reglas.cargarDeProyecto(proyectoId).map((r) => r.contenido);
    return this.servicioHarness.generarPlan(dto.instruccion, {
      limiteTokens: dto.limiteTokens,
      reglas, // las reglas del proyecto viajan en el prompt del sistema (F2-5a)
      proyectoId, // el gasto se registra y el límite aplica acumulado por proyecto (F2-5b)
    });
  }

  @Post('ejecutar')
  async ejecutar(
    @Param('proyectoId') proyectoId: string,
    @Body() dto: { workspaceId: string; plan: PlanIA },
  ) {
    this.exigirProveedores();
    return this.servicioHarness.ejecutarPlan(proyectoId, dto.workspaceId, dto.plan);
  }

  @Post('descartar')
  @HttpCode(200)
  descartar(
    @Param('proyectoId') proyectoId: string,
    @Body() dto: { workspaceId: string; checkpointInicial: string },
  ) {
    return this.servicioHarness.descartarTarea(proyectoId, dto.workspaceId, dto.checkpointInicial);
  }

  @Post('chat')
  async conversar(@Body() dto: { mensajes: MensajeIA[] }) {
    this.exigirProveedores();
    return this.servicioChat.responder(dto.mensajes ?? []);
  }

  private exigirProveedores(): void {
    if (!this.servicioHarness.tieneProveedores()) {
      throw new ServiceUnavailableException('Sin proveedores de IA configurados (EDP_AI_API_KEY)');
    }
  }
}
