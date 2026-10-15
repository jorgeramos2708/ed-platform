import { Inject, Injectable } from '@nestjs/common';
import { CADENA_PROVEEDORES, LimiteGastoError, ProveedorIA, QuotaError, UsoTokens, sumarUso } from './proveedor-ia';
import { promptDeReglas } from '../reglas/reglas.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CheckpointsService } from '../checkpoints/checkpoints.service';

export interface PasoPlan {
  accion: 'editar' | 'comando';
  archivo?: string;
  contenido?: string;
  comando?: string;
}

export interface PlanIA {
  titulo: string;
  pasos: PasoPlan[];
}

export interface PlanGenerado {
  plan: PlanIA;
  proveedor: string;
  failover: boolean;
  uso: UsoTokens;
}

export interface ResultadoEjecucion {
  checkpointInicial: string;
  checkpointFinal: string;
  diff: string;
  pasos: number;
}

export interface OpcionesGasto {
  limiteTokens?: number;
  reglas?: string[];
}

const PROMPT_SISTEMA =
  'Eres el AI Harness de ED Platform. Respondes SOLO un objeto JSON válido con esta forma: ' +
  '{"titulo": string, "pasos": [{"accion": "editar", "archivo": string, "contenido": string} | {"accion": "comando", "comando": string}]}. ' +
  'Sin texto fuera del JSON. Las rutas de archivo son relativas al workspace y nunca contienen "..".';

@Injectable()
export class HarnessService {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly checkpoints: CheckpointsService,
    @Inject(CADENA_PROVEEDORES) private readonly proveedores: ProveedorIA[],
  ) {}

  tieneProveedores(): boolean {
    return this.proveedores.length > 0;
  }

  // Genera el plan con failover (S5): cuota tipificada → siguiente proveedor; presupuesto acumulado
  async generarPlan(instruccion: string, opciones?: OpcionesGasto): Promise<PlanGenerado> {
    if (!this.proveedores.length) throw new Error('Sin proveedores de IA configurados (EDP_AI_API_KEY)');
    const mensajes: MensajeIA[] = [
      { rol: 'system', contenido: PROMPT_SISTEMA + promptDeReglas((opciones?.reglas ?? []).map((texto, i) => ({ nombre: "regla-" + (i + 1), descripcion: texto, prioridad: 10 - i, contenido: texto, archivo: "regla" }))) },
      { rol: 'user', contenido: instruccion },
    ];
    let uso: UsoTokens = { entrada: 0, salida: 0 };
    let ultimoError: unknown = new Error('sin proveedores');

    for (let i = 0; i < this.proveedores.length; i++) {
      const proveedor = this.proveedores[i];
      try {
        const respuesta = await proveedor.ejecutar({ mensajes, maxTokens: 4096 });
        uso = sumarUso(uso, respuesta.uso);
        const limite = opciones?.limiteTokens;
        if (limite && uso.entrada + uso.salida > limite) throw new LimiteGastoError(uso, limite);
        return { plan: this.parsearPlan(respuesta.contenido), proveedor: proveedor.nombre, failover: i > 0, uso };
      } catch (e) {
        if (e instanceof QuotaError) {
          ultimoError = e; // failover al siguiente (S5)
          continue;
        }
        throw e;
      }
    }
    throw ultimoError;
  }

  // Ejecución DETERMINISTA del plan aprobado: editar (base64, a prueba de quoting) y comandos,
  // con checkpoint INICIAL (para descartar) y FINAL. Los pasos quedan en el working tree (diffPendiente).
  async ejecutarPlan(proyectoId: string, wsId: string, plan: PlanIA): Promise<ResultadoEjecucion> {
    if (!plan?.pasos?.length) throw new Error('El plan no tiene pasos');

    // estado inicial para el descarte exacto
    let checkpointInicial: string;
    try {
      checkpointInicial = (await this.checkpoints.estado(proyectoId, wsId)).head;
    } catch {
      checkpointInicial = (await this.checkpoints.crear(proyectoId, wsId, 'estado inicial del workspace')).hash;
    }

    for (let i = 0; i < plan.pasos.length; i++) {
      const paso = plan.pasos[i];
      if (paso.accion === 'editar') {
        if (!paso.archivo || paso.archivo.includes('..') || paso.archivo.startsWith('/')) {
          throw new Error(`paso ${i + 1}: ruta de archivo inválida (${paso.archivo})`);
        }
        const b64 = Buffer.from(paso.contenido ?? '', 'utf8').toString('base64');
        const r = await this.workspaces.ejecutar(
          proyectoId,
          wsId,
          `echo ${b64} | base64 -d > '${paso.archivo}'`,
        );
        if (r.codigo !== 0) throw new Error(`paso ${i + 1} (editar) falló: ${r.salidaError}`);
      } else if (paso.accion === 'comando') {
        const r = await this.workspaces.ejecutar(proyectoId, wsId, paso.comando ?? 'true');
        if (r.codigo !== 0) {
          throw new Error(`paso ${i + 1} (comando) falló (exit ${r.codigo}): ${r.salidaError || r.salida}`);
        }
      } else {
        throw new Error(`paso ${i + 1}: acción desconocida (${paso.accion})`);
      }
    }

    const diff = await this.checkpoints.diffPendiente(proyectoId, wsId);
    const final = await this.checkpoints.crear(proyectoId, wsId, `tarea: ${plan.titulo}`);
    return { checkpointInicial, checkpointFinal: final.hash, diff, pasos: plan.pasos.length };
  }

  // Descartar la tarea: rewind EXACTO al estado inicial (S4) — lo que la UI llama al "descartar"
  async descartarTarea(proyectoId: string, wsId: string, checkpointInicial: string): Promise<void> {
    await this.checkpoints.rewind(proyectoId, wsId, checkpointInicial);
  }

  private parsearPlan(contenido: string): PlanIA {
    const sinFences = contenido.replace(/^```[a-z]*\s*/m, '').replace(/```\s*$/m, '').trim();
    const inicio = sinFences.indexOf('{');
    const fin = sinFences.lastIndexOf('}');
    if (inicio < 0 || fin <= inicio) throw new Error('La respuesta no contiene un objeto JSON');
    const plan = JSON.parse(sinFences.slice(inicio, fin + 1)) as PlanIA;
    if (!Array.isArray(plan.pasos)) throw new Error('El plan no tiene pasos');
    for (const paso of plan.pasos) {
      if (paso.accion !== 'editar' && paso.accion !== 'comando') {
        throw new Error(`Acción de paso inválida: ${paso.accion}`);
      }
    }
    return plan;
  }
}
