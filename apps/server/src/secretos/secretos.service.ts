import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ActorTipo, Auditoria } from '../db/auditoria.entity';
import { Secreto } from '../db/secreto.entity';
import { ActorSistema } from '../auditoria/actor';
import { CifradorService } from './cifrador.service';
import { SanitizadorService } from './sanitizador.service';

export interface SecretoMeta {
  id: string;
  proyectoId: string | null;
  nombre: string;
  creadoEn: Date;
  rotadoEn: Date | null;
  expiraEn: Date | null;
}

// Vault de secretos (S6/ADR-0005 convertido en módulo). Reglas:
// 1. SOLO material cifrado en BD — un volcado completo no revela valores (regresión en spec).
// 2. usos just-in-time: el valor plaintext vive únicamente en memoria del proceso y se
//    registra en el Sanitizador para que NINGÚN log pueda contenerlo (CONSTRAINTS §1.2).
// 3. NO existe endpoint que devuelva valores — la capa HTTP solo ve metadatos.
@Injectable()
export class SecretosService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cifrador: CifradorService,
    private readonly sanitizador: SanitizadorService,
  ) {}

  async crear(
    dto: { nombre: string; valor: string; proyectoId?: string },
    actor?: { id: string; tipo: ActorTipo },
  ): Promise<SecretoMeta> {
    const actorReal = actor ?? ActorSistema;
    const secreto = await this.dataSource.transaction(async (em) => {
      const dek = this.cifrador.generarDek();
      const envuelta = this.cifrador.cifrarCon(this.cifrador.clave, dek);
      const cifrado = this.cifrador.cifrarCon(dek, dto.valor);
      const repo = em.getRepository(Secreto);
      const fila = await repo.save(
        repo.create({
          nombre: dto.nombre,
          proyectoId: dto.proyectoId ?? null,
          encDek: envuelta.ct,
          dekIv: envuelta.iv,
          dekTag: envuelta.tag,
          ciphertext: cifrado.ct,
          iv: cifrado.iv,
          tag: cifrado.tag,
          creadoPorId: actorReal.tipo === ActorTipo.Usuario ? actorReal.id : null,
        }),
      );
      await this.auditar(em, actorReal, 'secreto.crear', fila.id, { nombre: dto.nombre });
      return fila;
    });
    this.sanitizador.registrarValor(dto.valor);
    return this.meta(secreto);
  }

  async listar(): Promise<SecretoMeta[]> {
    // select con sintaxis objeto (TypeORM v1 eliminó el array de strings)
    return this.dataSource.getRepository(Secreto).find({
      select: {
        id: true,
        proyectoId: true,
        nombre: true,
        creadoEn: true,
        rotadoEn: true,
        expiraEn: true,
      },
      order: { nombre: 'ASC' },
    });
  }

  // JUST-IN-TIME: para procesos internos (workers/entornos de ejecución). Sin endpoint.
  async usarPorNombre(nombre: string): Promise<{ nombre: string; valor: string }> {
    const fila = await this.dataSource.getRepository(Secreto).findOneByOrFail({ nombre });
    const dek = this.cifrador.descifrarCon(this.cifrador.clave, {
      ct: fila.encDek,
      iv: fila.dekIv,
      tag: fila.dekTag,
    });
    const valor = this.cifrador
      .descifrarCon(dek, { ct: fila.ciphertext, iv: fila.iv, tag: fila.tag })
      .toString('utf8');
    this.sanitizador.registrarValor(valor);
    const repo = this.dataSource.getRepository(Auditoria);
    await repo.save(
      repo.create({
        actorId: 'sistema',
        actorTipo: ActorTipo.Sistema,
        accion: 'secreto.usar',
        recursoTipo: 'secreto',
        recursoId: fila.id,
        detalle: { nombre }, // jamás el valor
      }),
    );
    return { nombre: fila.nombre, valor };
  }

  async rotar(id: string, nuevoValor: string, actor?: { id: string; tipo: ActorTipo }): Promise<void> {
    const actorReal = actor ?? ActorSistema;
    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(Secreto);
      const fila = await repo.findOneByOrFail({ id });
      const dek = this.cifrador.generarDek(); // nueva DEK: el valor viejo queda irrecuperable
      const envuelta = this.cifrador.cifrarCon(this.cifrador.clave, dek);
      const cifrado = this.cifrador.cifrarCon(dek, nuevoValor);
      fila.encDek = envuelta.ct;
      fila.dekIv = envuelta.iv;
      fila.dekTag = envuelta.tag;
      fila.ciphertext = cifrado.ct;
      fila.iv = cifrado.iv;
      fila.tag = cifrado.tag;
      fila.rotadoEn = new Date();
      await repo.save(fila);
      await this.auditar(em, actorReal, 'secreto.rotar', fila.id, { nombre: fila.nombre });
    });
    this.sanitizador.registrarValor(nuevoValor);
  }

  private async auditar(
    em: EntityManager,
    actor: { id: string; tipo: ActorTipo },
    accion: string,
    recursoId: string,
    detalle: Record<string, unknown>,
  ): Promise<void> {
    const auditoria = em.getRepository(Auditoria);
    await auditoria.save(
      auditoria.create({
        actorId: actor.id,
        actorTipo: actor.tipo,
        accion,
        recursoTipo: 'secreto',
        recursoId,
        detalle, // jamás contiene valores — solo nombres (verificado por spec)
      }),
    );
  }

  private meta(fila: Secreto): SecretoMeta {
    return {
      id: fila.id,
      proyectoId: fila.proyectoId,
      nombre: fila.nombre,
      creadoEn: fila.creadoEn,
      rotadoEn: fila.rotadoEn,
      expiraEn: fila.expiraEn,
    };
  }
}
