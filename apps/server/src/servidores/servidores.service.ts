import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { Auditoria, ActorTipo } from '../db/auditoria.entity';
import { Servidor } from '../db/servidor.entity';
import { PermisoServidor } from '../db/permiso-servidor.entity';
import { Secreto } from '../db/secreto.entity';

export interface ServidorConAcciones extends Servidor {
  acciones: string[];
}

const HOST_RE = /^[a-zA-Z0-9._-]{1,253}$/; // hostname o IP literal — sin espacios ni shell metachars
const ACCIONES_VALIDAS = new Set(['ejecutar', 'terminal', 'sftp']);

// Fase 4 (E08): catálogo de servidores. La credencial es POR REFERENCIA (credencialId → secretos);
// el acceso se concede por usuario/servidor/acción — sin permiso, denegado.
@Injectable()
export class ServidoresService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async crear(
    dto: { nombre: string; host: string; puerto: number; credencialId: string },
    actor?: { id: string; tipo: ActorTipo },
  ): Promise<Servidor> {
    const actorReal = actor ?? { id: 'sistema', tipo: ActorTipo.Sistema };
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,118}$/.test(dto.nombre)) {
      throw new Error(`Nombre de servidor inválido: ${dto.nombre}`);
    }
    if (!HOST_RE.test(dto.host)) {
      throw new Error(`Host inválido: ${dto.host}`);
    }
    if (!Number.isInteger(dto.puerto) || dto.puerto < 1 || dto.puerto > 65535) {
      throw new Error(`Puerto inválido: ${dto.puerto}`);
    }
    const credencial = await this.dataSource.getRepository(Secreto).findOneBy({ id: dto.credencialId });
    if (!credencial) throw new Error(`La credencial (secreto ${dto.credencialId}) no existe`);
    return this.dataSource.transaction(async (em) => {
      const guardado = await em.getRepository(Servidor).save(em.getRepository(Servidor).create(dto));
      await em.getRepository(Auditoria).save(
        em.getRepository(Auditoria).create({
          actorId: actorReal.id,
          actorTipo: actorReal.tipo,
          accion: 'servidor.crear',
          recursoTipo: 'servidor',
          recursoId: guardado.id,
          detalle: { nombre: guardado.nombre, host: guardado.host, puerto: guardado.puerto },
        }),
      );
      return guardado;
    });
  }

  // El usuario ve SOLO los servidores con permiso concedido (matriz: acceso por servidor/acción)
  async listarPara(usuarioId: string): Promise<ServidorConAcciones[]> {
    const permisos = await this.dataSource
      .getRepository(PermisoServidor)
      .findBy({ usuarioId });
    if (!permisos.length) return [];
    const servidores = await this.dataSource.getRepository(Servidor).find({
      where: { id: In(permisos.map((p) => p.servidorId)) },
      order: { nombre: 'ASC' },
    });
    return servidores.map((s) => ({
      ...s,
      acciones: permisos.find((p) => p.servidorId === s.id)!.acciones.split(','),
    }));
  }

  // Catálogo completo para administración
  async listarTodos(): Promise<Servidor[]> {
    return this.dataSource.getRepository(Servidor).find({ order: { nombre: 'ASC' } });
  }

  async concederPermiso(
    servidorId: string,
    usuarioId: string,
    acciones: string[],
    actor?: { id: string; tipo: ActorTipo },
  ): Promise<PermisoServidor> {
    const actorReal = actor ?? { id: 'sistema', tipo: ActorTipo.Sistema };
    const invalidas = acciones.filter((a) => !ACCIONES_VALIDAS.has(a));
    if (invalidas.length) throw new Error(`Acciones inválidas: ${invalidas.join(', ')}`);
    const repo = this.dataSource.getRepository(PermisoServidor);
    const existente = await repo.findOneBy({ servidorId, usuarioId });
    const permiso =
      existente ??
      (await repo.save(repo.create({ servidorId, usuarioId, acciones: acciones.join(',') })));
    if (existente) permiso.acciones = acciones.join(',');
    const guardado = await repo.save(permiso);
    await this.auditar(actorReal, 'servidor.permiso.conceder', servidorId, { usuarioId, acciones });
    return guardado;
  }

  async revocarPermiso(servidorId: string, usuarioId: string, actor?: { id: string; tipo: ActorTipo }): Promise<void> {
    const actorReal = actor ?? { id: 'sistema', tipo: ActorTipo.Sistema };
    await this.dataSource.getRepository(PermisoServidor).delete({ servidorId, usuarioId });
    await this.auditar(actorReal, 'servidor.permiso.revocar', servidorId, { usuarioId });
  }

  // Verificación previa a cada acceso (F4-2/3/4): permiso concedido y acción incluida
  async exigirPermiso(
    usuarioId: string,
    servidorId: string,
    accion: 'ejecutar' | 'terminal' | 'sftp',
  ): Promise<void> {
    const permiso = await this.dataSource
      .getRepository(PermisoServidor)
      .findOneBy({ servidorId, usuarioId });
    if (!permiso || !permiso.acciones.split(',').includes(accion)) {
      throw new Error(`Acceso denegado: sin permiso de ${accion} en este servidor`);
    }
  }

  async eliminar(id: string, actor?: { id: string; tipo: ActorTipo }): Promise<void> {
    const actorReal = actor ?? { id: 'sistema', tipo: ActorTipo.Sistema };
    // Los permisos se eliminan explicitamente (ademas del ON DELETE CASCADE de la migracion):
    // el contrato de eliminacion no depende de la configuracion de la FK
    await this.dataSource.getRepository(PermisoServidor).delete({ servidorId: id });
    await this.dataSource.getRepository(Servidor).delete({ id });
    await this.auditar(actorReal, 'servidor.eliminar', id, {});
  }

  async obtener(id: string): Promise<Servidor> {
    return this.dataSource.getRepository(Servidor).findOneByOrFail({ id });
  }

  private async auditar(actor: { id: string; tipo: ActorTipo }, accion: string, recursoId: string, detalle: unknown): Promise<void> {
    await this.dataSource.getRepository(Auditoria).save(
      this.dataSource.getRepository(Auditoria).create({
        actorId: actor.id,
        actorTipo: actor.tipo,
        accion,
        recursoTipo: 'servidor',
        recursoId,
        detalle: detalle as Record<string, unknown>,
      }),
    );
  }
}
