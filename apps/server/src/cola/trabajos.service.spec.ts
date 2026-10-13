// RED: cola persistente pg-boss integrada en NestJS — el núcleo de la puerta M1:
// "reiniciar los servicios no deja trabajos en estados incoherentes"
import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TrabajosService } from './trabajos.service';
import { Trabajo } from '../db/trabajo.entity';

const DB = process.env.DATABASE_URL ?? 'postgres://edp:edp_dev@localhost:5433/edp';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function moduloCola() {
  const ref = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({ type: 'postgres', url: DB, entities: [Trabajo], synchronize: true }),
      TypeOrmModule.forFeature([Trabajo]),
    ],
    providers: [TrabajosService],
  }).compile();
  const service = ref.get(TrabajosService);
  await service.onModuleInit(); // como haría Nest al arrancar
  return { service, dataSource: ref.get(DataSource) };
}

async function esperarHasta(cond: () => Promise<boolean>, timeoutMs = 25000): Promise<boolean> {
  const fin = Date.now() + timeoutMs;
  while (Date.now() < fin) {
    if (await cond()) return true;
    await sleep(250);
  }
  return false;
}

describe('TrabajosService — cola persistente (núcleo puerta M1)', () => {
  beforeEach(async () => {
    // limpieza por test (se conecta un módulo temporal solo para truncar)
    const { dataSource } = await moduloCola();
    await dataSource.query('TRUNCATE trabajos');
    await dataSource.query('TRUNCATE pgboss.job');
    await dataSource.destroy();
  });

  it('encola un trabajo, el worker lo procesa y el espejo queda completed con resultado', async () => {
    const { service, dataSource } = await moduloCola();
    service.registrarWorker('eco', async (payload: Record<string, unknown>) => ({ eco: payload }));

    const trabajo = await service.encolar('eco', { mensaje: 'hola' });
    expect(trabajo.estadoEspejo).toBe('created');

    const completo = await esperarHasta(async () => {
      const t = (await service.listar()).find((x) => x.id === trabajo.id);
      return t?.estadoEspejo === 'completed';
    });
    expect(completo).toBe(true);
    const t = (await service.listar()).find((x) => x.id === trabajo.id)!;
    expect(t.resultado).toEqual({ eco: { mensaje: 'hola' } });
    await service.onModuleDestroy();
    await dataSource.destroy();
  });

  it('tras un CRASH del worker, el trabajo se re-entrega y completa de forma coherente (sin duplicados ni estados huérfanos)', async () => {
    // Módulo A: worker que se queda colgado a mitad del trabajo (como un proceso muerto)
    let liberar: (v?: unknown) => void = () => {};
    const colgado = new Promise((r) => (liberar = r));
    const a = await moduloCola();
    a.service.registrarWorker('mantenimiento', async () => {
      await colgado; // trabajo en curso indefinidamente
      return {};
    });
    const trabajo = await a.service.encolar(
      'mantenimiento',
      { paso: 1 },
      { expireInSeconds: 2, retryLimit: 5, retryDelay: 1 },
    );
    // el worker de A lo toma y el espejo queda 'active'
    const tomado = await esperarHasta(async () => {
      const t = (await a.service.listar()).find((x) => x.id === trabajo.id);
      return t?.estadoEspejo === 'active';
    });
    expect(tomado).toBe(true);

    // CRASH: el worker de A muere sin cerrar el trabajo (parada no agraciada, como process.exit)
    await a.service.pararBrusco();

    // Módulo B (proceso "nuevo"): su worker debe re-entregar y completar
    const b = await moduloCola();
    b.service.registrarWorker('mantenimiento', async (payload) => ({ hecho: payload }));

    const coherente = await esperarHasta(async () => {
      const t = (await b.service.listar()).find((x) => x.id === trabajo.id);
      return t?.estadoEspejo === 'completed' && t.intentos >= 2; // intento 1 (A, crash) + intento 2 (B)
    }, 40000);
    expect(coherente).toBe(true);
    const t = (await b.service.listar()).find((x) => x.id === trabajo.id)!;
    expect(t.resultado).toEqual({ hecho: { paso: 1 } });
    liberar();
    await a.service.onModuleDestroy();
    await b.service.onModuleDestroy();
    await a.dataSource.destroy();
    await b.dataSource.destroy();
  });

  it('cancelar un trabajo pendiente lo deja en cancelled (y no se ejecuta)', async () => {
    const { service, dataSource } = await moduloCola();
    service.registrarWorker('eco', async (payload) => payload);
    const trabajo = await service.encolar('eco', { nunca: true }, { startAfter: 3600 });
    await service.cancelar(trabajo.id);
    const t = (await service.listar()).find((x) => x.id === trabajo.id);
    expect(t?.estadoEspejo).toBe('cancelled');
    await service.onModuleDestroy();
    await dataSource.destroy();
  });
});
