import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createHash } from 'node:crypto';
import { CorridaCi } from '../db/corrida-ci.entity';
import { CorridaEtapa } from '../db/corrida-etapa.entity';
import { Artefacto } from '../db/artefacto.entity';
import { PipelineService } from './pipeline.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { GitService } from '../git/git.service';
import { SecretosService } from '../secretos/secretos.service';
import { ProyectosService } from '../proyectos/proyectos.service';
import { TrabajosService } from '../cola/trabajos.service';

export interface PipelineDefinido {
  etapas: { nombre: string; comandos: string[] }[];
  artefactos: { ruta: string; etiqueta: string }[];
}

// F5-3: el disparo va por la COLA (S3) — la corrida se ejecuta en background y SUS RESULTADOS
// persisten en BD (la puerta: consultables tras reiniciar). El API responde 202 inmediato.
@Injectable()
export class CiService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CiService.name);
  private static readonly TIPO = 'ci.corrida';

  constructor(
    private readonly pipeline: PipelineService,
    private readonly workspaces: WorkspacesService,
    private readonly git: GitService,
    private readonly secretos: SecretosService,
    private readonly proyectos: ProyectosService,
    private readonly trabajos: TrabajosService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    this.trabajos.registrarWorker(CiService.TIPO, async (payload) => {
      const corridaId = String(payload.corridaId);
      await this.ejecutar(corridaId);
      return { corridaId };
    });
  }

  onModuleDestroy(): void {
    // los trabajos en curso los gestiona la cola (S3: re-entrega tras reinicio)
  }

  // Crea la corrida (pendiente) y encola su ejecución — el HTTP responde inmediato
  async disparar(proyectoId: string, commitSha?: string): Promise<CorridaCi> {
    const proyecto = await this.proyectos.obtener(proyectoId);
    if (!proyecto.repoUrl) throw new Error('El proyecto no tiene remoto configurado (repo_url)');
    const repo = this.dataSource.getRepository(CorridaCi);
    const corrida = await repo.save(
      repo.create({
        proyectoId,
        commitSha: commitSha ?? '',
        estado: 'pendiente',
      }),
    );
    await this.trabajos.encolar(CiService.TIPO, { corridaId: corrida.id });
    return corrida;
  }

  // Ejecuta una corrida YA CREADA (la llama el worker de la cola): clona el commit,
  // lee el pipeline, ejecuta etapas secuenciales y recolecta artefactos.
  async ejecutar(corridaId: string): Promise<CorridaCi> {
    const repo = this.dataSource.getRepository(CorridaCi);
    const corrida = await repo.findOneByOrFail({ id: corridaId });
    const proyecto = await this.proyectos.obtener(corrida.proyectoId);
    if (!proyecto.repoUrl) throw new Error('El proyecto no tiene remoto configurado (repo_url)');
    try {
      await repo.update({ id: corrida.id }, { estado: 'ejecutando' });
      const ws = await this.workspaces.crear(corrida.proyectoId, { gitInit: false });
      const token = await this.tokenDelProyecto(proyecto);
      await this.git.clonar(corrida.proyectoId, ws.id, {
        url: proyecto.repoUrl,
        rama: proyecto.ramaDefault || 'main',
        token,
      });
      if (corrida.commitSha) {
        const checkout = await this.workspaces.ejecutar(corrida.proyectoId, ws.id, `git checkout -q ${corrida.commitSha}`);
        if (checkout.codigo !== 0) throw new Error(`checkout del commit falló: ${checkout.salidaError}`);
      }
      const head = await this.workspaces.ejecutar(corrida.proyectoId, ws.id, 'git rev-parse HEAD');
      const sha = head.salida.trim();
      await repo.update({ id: corrida.id }, { commitSha: sha });

      const definicion = await this.leerPipeline(corrida.proyectoId, ws.id);

      // TODAS las etapas se pre-crean como pendientes: el reporte muestra el plan completo,
      // y una etapa fallida deja visibles las que no llegaron a ejecutarse
      const etapaRepo = this.dataSource.getRepository(CorridaEtapa);
      const filas = new Map<string, CorridaEtapa>();
      for (const etapa of definicion.etapas) {
        const fila = await etapaRepo.save(
          etapaRepo.create({ corridaId: corrida.id, nombre: etapa.nombre, estado: 'pendiente' }),
        );
        filas.set(etapa.nombre, fila);
      }

      let fallida = false;
      for (const etapa of definicion.etapas) {
        const fila = filas.get(etapa.nombre)!;
        await etapaRepo.update({ id: fila.id }, { estado: 'ejecutando', iniciadoEn: new Date() });
        let salida = '';
        let etapaOk = true;
        for (const comando of etapa.comandos) {
          const r = await this.workspaces.ejecutar(corrida.proyectoId, ws.id, comando, { timeoutMs: 300000 });
          salida += `> ${comando}\n${r.salida}${r.salidaError ? `[stderr] ${r.salidaError}` : ''}\n`;
          if (r.codigo !== 0) {
            etapaOk = false;
            salida += `[etapa fallida: ${comando} salió con código ${r.codigo}]\n`;
            break;
          }
        }
        await etapaRepo.update(
          { id: fila.id },
          { estado: etapaOk ? 'exitosa' : 'fallida', salida, terminadoEn: new Date() },
        );
        if (!etapaOk) {
          fallida = true;
          break;
        }
      }

      if (!fallida && definicion.artefactos.length) {
        await this.recolectarArtefactos(corrida.id, corrida.proyectoId, ws.id, definicion.artefactos);
      }

      const estadoFinal = fallida ? 'fallida' : 'exitosa';
      await repo.update({ id: corrida.id }, { estado: estadoFinal, terminadoEn: new Date() });
      return (await repo.findOneByOrFail({ id: corrida.id }))!;
    } catch (e) {
      await repo.update({ id: corrida.id }, { estado: 'fallida', terminadoEn: new Date() });
      throw e;
    }
  }

  async contenidoArtefacto(artefactoId: string): Promise<{ id: string; etiqueta: string; digest: string; contenidoBase64: string }> {
    const a = await this.dataSource.getRepository(Artefacto).findOneByOrFail({ id: artefactoId });
    return { id: a.id, etiqueta: a.etiqueta, digest: a.digest, contenidoBase64: a.contenido.toString('base64') };
  }

  async listarDelProyecto(proyectoId: string): Promise<CorridaCi[]> {
    return this.dataSource.getRepository(CorridaCi).find({
      where: { proyectoId },
      order: { iniciadoEn: 'DESC' },
    });
  }

  async obtener(corridaId: string): Promise<{ corrida: CorridaCi; etapas: CorridaEtapa[] }> {
    const corrida = await this.dataSource.getRepository(CorridaCi).findOneByOrFail({ id: corridaId });
    const etapas = await this.dataSource.getRepository(CorridaEtapa).find({
      where: { corridaId },
      order: { iniciadoEn: 'ASC' },
    });
    return { corrida, etapas };
  }

  private async leerPipeline(proyectoId: string, wsId: string): Promise<PipelineDefinido> {
    const lectura = await this.workspaces.ejecutar(proyectoId, wsId, 'cat .edp-pipeline.yml');
    if (lectura.codigo !== 0) {
      throw new Error('El repositorio no tiene .edp-pipeline.yml (pipelines como código)');
    }
    return this.pipeline.parsear(lectura.salida);
  }

  private async tokenDelProyecto(proyecto: { repoCredencial: string | null }): Promise<string | undefined> {
    const nombre = proyecto.repoCredencial || 'github-token';
    try {
      return (await this.secretos.usarPorNombre(nombre)).valor;
    } catch {
      return undefined;
    }
  }

  private async recolectarArtefactos(
    corridaId: string,
    proyectoId: string,
    wsId: string,
    definidos: { ruta: string; etiqueta: string }[],
  ): Promise<void> {
    const repoArtefactos = this.dataSource.getRepository(Artefacto);
    for (const definido of definidos) {
      // v1: la ruta es un archivo exacto dentro del workspace (glob P2)
      const lectura = await this.workspaces.ejecutar(
        proyectoId,
        wsId,
        `base64 < "${definido.ruta.replace(/"/g, '')}"`,
      );
      if (lectura.codigo !== 0) continue; // el artefacto no existe en esta corrida: se omite
      const contenido = Buffer.from(lectura.salida.replace(/\s+/g, ''), 'base64');
      const digest = createHash('sha256').update(contenido).digest('hex');
      await repoArtefactos.save(
        repoArtefactos.create({
          corridaId,
          etiqueta: definido.etiqueta,
          rutaRelativa: definido.ruta,
          digest,
          contenido,
        }),
      );
    }
  }
}
