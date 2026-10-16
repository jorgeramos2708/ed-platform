import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PgBoss } from 'pg-boss'; // v12: ESM con export nombrado (sin default)
import { EstadoTrabajo, Trabajo } from '../db/trabajo.entity';
import { LoggerSeguro } from '../core/logger-seguro.service';

export type ManejadorTrabajo = (payload: Record<string, unknown>) => Promise<unknown>;

export interface OpcionesEncolar {
  expireInSeconds?: number;
  retryLimit?: number;
  retryDelay?: number;
  startAfter?: number;
}

// Cola persistente pg-boss v12 (S3/ADR-0004) + espejo de negocio en `trabajos`.
// El espejo vive en la MISMA BD: la cola y los datos de negocio comparten motor y backups.
// NOTA v12: modelo queue-first — sin createQueue, send() devuelve null en silencio (S3).
@Injectable()
export class TrabajosService implements OnModuleInit, OnModuleDestroy {
  private boss?: PgBoss;
  private iniciado = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly logger: LoggerSeguro,
  ) {}

  async onModuleInit() {
    this.boss = new PgBoss({
      connectionString: process.env.DATABASE_URL ?? 'postgres://edp:edp_dev@localhost:5433/edp',
      maintenanceIntervalSeconds: 2, // re-entrega rápida; en producción se usará el default
    });
    this.boss.on('error', (e) => this.logger.error(e.message, e.stack, 'Cola')); // deuda M1 #2: errores de cola vía LoggerSeguro
    await this.boss.start();
    this.iniciado = true;
    // Los módulos registran sus handlers explícitamente via registrarWorker (sin magia en el servicio)
  }

  // Parada agraciada: termina los trabajos en curso antes de cerrar
  async onModuleDestroy() {
    await this.boss?.stop();
    this.iniciado = false;
    this.boss = undefined;
  }

  // Simula un crash del worker (tests/puerta M1): parada NO agraciada — los jobs activos quedan huérfanos
  async pararBrusco() {
    await this.boss?.stop({ graceful: false, timeout: 0, close: true });
    this.iniciado = false;
    this.boss = undefined;
  }

  // v12 es queue-first: sin createQueue, send() devuelve null y work no procesa (hallazgo S3)
  private async asegurarCola(tipo: string): Promise<void> {
    if (!this.boss) return;
    try {
      await this.boss.createQueue(tipo);
    } catch {
      /* ya existe */
    }
  }

  registrarWorker(tipo: string, handler: ManejadorTrabajo): void {
    if (!this.iniciado || !this.boss) throw new Error('La cola aún no arrancó (onModuleInit)');
    void this.asegurarCola(tipo).then(() =>
      this.boss!.work(
        tipo,
        { batchSize: 1, pollingIntervalSeconds: 1, includeMetadata: true },
        async (jobs) => {
          for (const job of jobs) {
            await this.marcar(tipo, job.id, EstadoTrabajo.Active, { intentos: job.retryCount + 1 });
            try {
              const resultado = await handler((job.data ?? {}) as Record<string, unknown>);
              await this.marcar(tipo, job.id, EstadoTrabajo.Completed, { resultado });
            } catch (e) {
              // queda 'retry' mientras pg-boss aplique su política; 'failed' al agotar
              await this.marcar(tipo, job.id, EstadoTrabajo.Retry, {
                resultado: { error: (e as Error).message },
              });
              throw e;
            }
          }
        },
      ),
    );
  }

  async encolar(
    tipo: string,
    payload: Record<string, unknown>,
    opciones?: OpcionesEncolar,
  ): Promise<Trabajo> {
    if (!this.iniciado || !this.boss) throw new Error('La cola aún no arrancó');
    await this.asegurarCola(tipo);
    const jobId = await this.boss.send(tipo, payload, opciones as never);
    if (!jobId) {
      throw new Error(`pg-boss no creó el trabajo "${tipo}" — ¿cola inexistente? (hallazgo S3: queue-first)`);
    }
    const repo = this.dataSource.getRepository(Trabajo);
    return repo.save(
      repo.create({
        tipo,
        pgbossJobId: jobId,
        payloadRef: payload,
        estadoEspejo: EstadoTrabajo.Created,
      }),
    );
  }

  async cancelar(trabajoId: string): Promise<Trabajo> {
    const repo = this.dataSource.getRepository(Trabajo);
    const trabajo = await repo.findOneByOrFail({ id: trabajoId });
    await this.boss!.cancel(trabajo.tipo, trabajo.pgbossJobId!);
    trabajo.estadoEspejo = EstadoTrabajo.Cancelled;
    await repo.save(trabajo);
    return trabajo;
  }

  async listar(): Promise<Trabajo[]> {
    return this.dataSource.getRepository(Trabajo).find({ order: { creadoEn: 'DESC' } });
  }

  private async marcar(
    tipo: string,
    pgbossJobId: string,
    estado: EstadoTrabajo,
    extra?: { resultado?: unknown; intentos?: number },
  ) {
    const repo = this.dataSource.getRepository(Trabajo);
    const trabajo = await repo.findOneBy({ tipo, pgbossJobId });
    if (!trabajo) return; // defensivo: job sin espejo
    trabajo.estadoEspejo = estado;
    if (extra?.intentos !== undefined) trabajo.intentos = extra.intentos;
    if (extra?.resultado !== undefined) trabajo.resultado = extra.resultado as Record<string, unknown>;
    await repo.save(trabajo);
  }
}
