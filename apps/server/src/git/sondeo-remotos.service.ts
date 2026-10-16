import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Auditoria, ActorTipo } from '../db/auditoria.entity';
import { Proyecto } from '../db/proyecto.entity';
import { GitService } from './git.service';

export interface ResultadoVerificacion {
  cambio: boolean;
  hashAnterior: string | null;
  hashNuevo: string | null;
}

// F3-4: sondeo del remoto — un intervalo (v1; la cola queda para trabajos de negocio) revisa
// el ls-remote de cada proyecto con remoto, compara con el último hash conocido y AUDITA
// los avances del origen. EDP_POLL_REMOTOS_SEG controla el intervalo (0 = desactivado).
@Injectable()
export class SondeoRemotosService implements OnModuleInit, OnModuleDestroy {
  private intervalo?: NodeJS.Timeout;

  constructor(
    private readonly git: GitService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    const segundos = Number(process.env.EDP_POLL_REMOTOS_SEG ?? 300);
    if (segundos > 0 && this.dataSource.isInitialized) {
      this.intervalo = setInterval(() => {
        void this.procesarTodos().catch(() => undefined);
      }, segundos * 1000);
      this.intervalo.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.intervalo) clearInterval(this.intervalo);
  }

  // Verifica UN proyecto: ls-remote de su rama por defecto vs remotoHead conocido.
  // Con avance: actualiza remoto_head y audita. Sin remoto: saltado.
  async verificarRemoto(proyectoId: string): Promise<ResultadoVerificacion> {
    const repo = this.dataSource.getRepository(Proyecto);
    const proyecto = await repo.findOneByOrFail({ id: proyectoId });
    if (!proyecto.repoUrl) return { cambio: false, hashAnterior: null, hashNuevo: null };

    const hashNuevo = await this.git.remotoHead(
      proyectoId,
      proyecto.repoUrl,
      proyecto.ramaDefault || 'main',
    );
    const hashAnterior = proyecto.remotoHead;
    if (hashAnterior === hashNuevo) {
      return { cambio: false, hashAnterior, hashNuevo };
    }
    await repo.update({ id: proyectoId }, { remotoHead: hashNuevo });
    await this.dataSource.getRepository(Auditoria).save(
      this.dataSource.getRepository(Auditoria).create({
        actorId: 'sistema',
        actorTipo: ActorTipo.Sistema,
        accion: 'proyecto.remoto.avance',
        recursoTipo: 'proyecto',
        recursoId: proyectoId,
        detalle: { hashAnterior, hashNuevo, rama: proyecto.ramaDefault },
      }),
    );
    return { cambio: true, hashAnterior, hashNuevo };
  }

  // Una pasada sobre todos los proyectos con remoto (lo invoca el intervalo; también los tests)
  async procesarTodos(): Promise<{ sondeados: number; saltados: number; avances: number }> {
    const proyectos = await this.dataSource.getRepository(Proyecto).find();
    let sondeados = 0;
    let saltados = 0;
    let avances = 0;
    for (const p of proyectos) {
      if (!p.repoUrl) {
        saltados++;
        continue;
      }
      sondeados++;
      try {
        const r = await this.verificarRemoto(p.id);
        if (r.cambio) avances++;
      } catch {
        // un remoto caído no tumba el sondeo (el siguiente intento lo reintenta)
      }
    }
    return { sondeados, saltados, avances };
  }
}
