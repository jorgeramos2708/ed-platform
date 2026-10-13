import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Auditoria, ActorTipo } from '../db/auditoria.entity';
import { Proyecto } from '../db/proyecto.entity';

@Injectable()
export class ProyectosService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // Proyecto + auditoría en la MISMA transacción (modelo-datos, convención 3: compromiso 5 de trazabilidad)
  async crear(dto: { nombre: string; repoUrl?: string }): Promise<Proyecto> {
    return this.dataSource.transaction(async (em) => {
      const slug = await this.slugUnico(em, dto.nombre);
      const proyectos = em.getRepository(Proyecto);
      const proyecto = await proyectos.save(
        proyectos.create({
          nombre: dto.nombre,
          slug,
          repoUrl: dto.repoUrl ?? null,
        }),
      );
      const auditoria = em.getRepository(Auditoria);
      await auditoria.save(
        auditoria.create({
          actorId: 'sistema',
          actorTipo: ActorTipo.Sistema, // hasta auth (slice 3); después será el usuario autenticado
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
