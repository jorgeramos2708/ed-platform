import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { CorridaCi } from '../db/corrida-ci.entity';
import { CorridaEtapa } from '../db/corrida-etapa.entity';
import { Artefacto } from '../db/artefacto.entity';
import { PipelineService } from './pipeline.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { GitService } from '../git/git.service';
import { SecretosService } from '../secretos/secretos.service';
import { ProyectosService } from '../proyectos/proyectos.service';

// F5-2: el EJECUTOR de CI — runners propios (decisión ADR-0002 mitad CI):
// el pipeline del repositorio corre en un WORKSPACE AISLADO (S1) clonado del commit,
// etapas secuenciales con logs por etapa, y artefactos con digest persistidos en BD.
// La cola (S3) lleva la persistencia de la ejecución — los resultados sobreviven reinicios.
@Injectable()
export class CiService {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly workspaces: WorkspacesService,
    private readonly git: GitService,
    private readonly secretos: SecretosService,
    private readonly proyectos: ProyectosService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // Crea la corrida (pendiente) y la ejecuta. v1 síncrono; el desacople por cola llega en F5-3.
  async ejecutarCorrida(proyectoId: string, commitSha?: string): Promise<CorridaCi> {
    const proyecto = await this.proyectos.obtener(proyectoId);
    if (!proyecto.repoUrl) throw new Error('El proyecto no tiene remoto configurado (repo_url)');
    const repo = this.dataSource.getRepository(CorridaCi);
    const corrida = await repo.save(
      repo.create({
        proyectoId,
        commitSha: commitSha ?? '', // se completa tras el clon (el SHA exacto lo fija git)
        estado: 'ejecutando',
      }),
    );
    try {
      const ws = await this.workspaces.crear(proyectoId, { gitInit: false });
      const token = await this.tokenDelProyecto(proyecto);
      await this.git.clonar(proyectoId, ws.id, {
        url: proyecto.repoUrl,
        rama: proyecto.ramaDefault || 'main',
        token,
      });
      if (commitSha) {
        const checkout = await this.workspaces.ejecutar(proyectoId, ws.id, `git checkout -q ${commitSha}`);
        if (checkout.codigo !== 0) throw new Error(`checkout del commit falló: ${checkout.salidaError}`);
      }
      const head = await this.workspaces.ejecutar(proyectoId, ws.id, 'git rev-parse HEAD');
      const sha = head.salida.trim();
      await repo.update({ id: corrida.id }, { commitSha: sha });

      const definicion = await this.leerPipeline(proyectoId, ws.id);
      await repo.update({ id: corrida.id }, { pipelinePath: '.edp-pipeline.yml' });

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
          const r = await this.workspaces.ejecutar(proyectoId, ws.id, comando, { timeoutMs: 300000 });
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
          break; // las etapas siguientes quedan pendientes (visibles en el reporte)
        }
      }

      if (!fallida && definicion.artefactos.length) {
        await this.recolectarArtefactos(corrida.id, proyectoId, ws.id, definicion.artefactos);
      }

      const estadoFinal = fallida ? 'fallida' : 'exitosa';
      await repo.update({ id: corrida.id }, { estado: estadoFinal, terminadoEn: new Date() });
      return (await repo.findOneByOrFail({ id: corrida.id }))!;
    } catch (e) {
      await repo.update({ id: corrida.id }, { estado: 'fallida', terminadoEn: new Date() });
      throw e;
    }
  }

  private async leerPipeline(proyectoId: string, wsId: string): Promise<ReturnType<PipelineService['parsear']>> {
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
