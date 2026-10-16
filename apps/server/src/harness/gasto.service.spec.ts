// RED: gasto de IA persistente por proyecto (F2-5b) — la base de los límites de gasto (E05)
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GastoIa } from '../db/gasto-ia.entity';
import { randomUUID } from 'node:crypto';
import { GastoService } from './gasto.service';

describe('GastoService (integración PostgreSQL)', () => {
  let service: GastoService;
  let dataSource: DataSource;
  const idP1 = randomUUID();
  const idP2 = randomUUID();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env.DATABASE_URL ?? 'postgres://edp:edp_dev@localhost:5433/edp_test',
          entities: [GastoIa],
          synchronize: true, // solo este spec: la migración de gasto_ia llega con 0002
        }),
        TypeOrmModule.forFeature([GastoIa]),
      ],
      providers: [GastoService],
    }).compile();
    service = moduleRef.get(GastoService);
    dataSource = moduleRef.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE gasto_ia RESTART IDENTITY CASCADE');
  });

  it('registra el uso por proyecto y proveedor', async () => {
    await service.registrar(idP1, 'principal', { entrada: 100, salida: 50 });
    const fila = await dataSource.getRepository(GastoIa).findOneByOrFail({ proyectoId: idP1 });
    expect(fila.proveedor).toBe('principal');
    expect(fila.tokensEntrada).toBe(100);
    expect(fila.tokensSalida).toBe(50);
  });

  it('totalDelProyecto suma todas las llamadas del proyecto (y solo de ese proyecto)', async () => {
    await service.registrar(idP1, 'principal', { entrada: 100, salida: 50 });
    await service.registrar(idP1, 'respaldo', { entrada: 30, salida: 20 });
    await service.registrar(idP2, 'principal', { entrada: 999, salida: 999 });
    const total = await service.totalDelProyecto(idP1);
    expect(total).toBe(200); // 100+50+30+20 = 200 tokens
    const totalP2 = await service.totalDelProyecto(idP2);
    expect(totalP2).toBe(1998);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });
});
