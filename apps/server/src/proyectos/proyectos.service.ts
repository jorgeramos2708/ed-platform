import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Auditoria, ActorTipo } from '../db/auditoria.entity';
import { Proyecto } from '../db/proyecto.entity';

@Injectable()
export class ProyectosService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // Proyecto + auditoría en la MISMA transacción (modelo-datos, convención 3: compromiso 5 de trazabilidad)
  async crear(
    dto: { nombre: string; repoUrl?: string },
    actor?: { id: string; tipo: ActorTipo },
  ): Promise<Proyecto> {
    const actorReal = actor ?? { id: 'sistema', tipo: ActorTipo.Sistema };
    return this.dataSource.transaction(async (em) => {
      const slug = await this.slugUnico(em, dto.nombre);
      const proyectos = em.getRepository(Proyecto);
      const proyecto = await proyectos.save(
        proyectos.create({
          nombre: dto.nombre,
          slug,
          repoUrl: dto.repoUrl ?? null,
          creadoPorId: actorReal.tipo === ActorTipo.Usuario ? actorReal.id : null,
        }),
      );
      const auditoria = em.getRepository(Auditoria);
      await auditoria.save(
        auditoria.create({
          actorId: actorReal.id,
          actorTipo: actorReal.tipo,
          accion: 'proyecto.crear',
          recursoTipo: 'proyecto',
          recursoId: proyecto.id,
          detalle: { nombre: proyecto.nombre },
        }),
      );
      return proyecto;
    });
  }

  async listar(): Promise<Proyecto[]> {
    return this.dataSource.getRepository(Proyecto).find({ order: { creadoEn: 'ASC' } });
  }

  async obtener(id: string): Promise<Proyecto> {
    return this.dataSource.getRepository(Proyecto).findOneByOrFail({ id });
  }

  // Fase 3 (Git y remotos): configurar/cambiar el remoto del proyecto.
  // La URL se valida (solo https:// o git@) — nunca file:// ni http:// (frontera de seguridad).
  async actualizarRemoto(
    proyectoId: string,
    dto: { repoUrl: string | null; ramaDefault?: string },
    actor?: { id: string; tipo: ActorTipo },
  ): Promise<Proyecto> {
    const actorReal = actor ?? { id: 'sistema', tipo: ActorTipo.Sistema };
    const repoUrl = dto.repoUrl;
    // file:// SOLO en modo pruebas (EDP_GIT_REMOTOS_DIR): permite ensayar la puerta completa
    // con bare repos locales; en producción la frontera https:// / git@ es inquebrantable
    const modoPruebas = Boolean(process.env.EDP_GIT_REMOTOS_DIR);
    const urlValida =
      (repoUrl && /^https:\/\/[^\s]+\.git$/.test(repoUrl)) ||
      (repoUrl && /^git@[^\s:]+:[^\s]+\.git$/.test(repoUrl)) ||
      (repoUrl && modoPruebas && repoUrl.startsWith('file://') && repoUrl.includes('.git'));
    if (repoUrl && !urlValida) {
      throw new Error(`URL del remoto inválida (solo https://…​.git o git@host:repo.git): ${repoUrl}`);
    }
    const rama = dto.ramaDefault?.trim() || undefined;
    if (rama && !/^[A-Za-z0-9._/-]{1,64}$/.test(rama)) {
      throw new Error(`Nombre de rama inválido: ${rama}`);
    }
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(Proyecto);
      const proyecto = await repo.findOneByOrFail({ id: proyectoId });
      proyecto.repoUrl = repoUrl;
      if (rama) proyecto.ramaDefault = rama;
      const guardado = await repo.save(proyecto);
      await em.getRepository(Auditoria).save(
        em.getRepository(Auditoria).create({
          actorId: actorReal.id,
          actorTipo: actorReal.tipo,
          accion: 'proyecto.remoto.configurar',
          recursoTipo: 'proyecto',
          recursoId: proyecto.id,
          detalle: { repoUrl: guardado.repoUrl, ramaDefault: guardado.ramaDefault },
        }),
      );
      return guardado;
    });
  }

  private async slugUnico(em: EntityManager, nombre: string): Promise<string> {
    const base = this.slugificar(nombre) || 'proyecto';
    let candidato = base;
    let n = 2;
    while (await em.getRepository(Proyecto).findOneBy({ slug: candidato })) {
      candidato = `${base}-${n++}`;
    }
    return candidato;
  }

  private slugificar(nombre: string): string {
    return nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // quitar acentos
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
