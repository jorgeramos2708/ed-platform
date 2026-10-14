// RED: integración real contra el PostgreSQL del compose (medio: localhost, BD de desarrollo)
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { configuracionBd } from '../db/configuracion-bd';
import { DataSource } from 'typeorm';
import { ProyectosService } from './proyectos.service';
import { Proyecto } from '../db/proyecto.entity';
import { Auditoria } from '../db/auditoria.entity';

describe('ProyectosService (integración PostgreSQL)', () => {
  let service: ProyectosService;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(configuracionBd()),
        TypeOrmModule.forFeature([Proyecto, Auditoria]),
      ],
      providers: [ProyectosService],
    }).compile();
    service = moduleRef.get(ProyectosService);
    dataSource = moduleRef.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE proyectos, auditoria RESTART IDENTITY CASCADE');
  });

  it('crea un proyecto persistido con slug derivado del nombre', async () => {
    const p = await service.crear({ nombre: 'Mi Proyecto' });
    expect(p.id).toBeDefined();
    expect(p.slug).toBe('mi-proyecto');
    expect(p.clasificacion).toBe('local'); // default seguro (decisión 14)
    const enDb = await dataSource.getRepository(Proyecto).findOneBy({ id: p.id });
    expect(enDb?.nombre).toBe('Mi Proyecto');
  });

  it('genera slug único con sufijo cuando el slug ya existe', async () => {
    const primero = await service.crear({ nombre: 'Mi Proyecto' });
    const segundo = await service.crear({ nombre: 'Mi Proyecto' });
    expect(primero.slug).toBe('mi-proyecto');
    expect(segundo.slug).toBe('mi-proyecto-2');
  });

  it('escribe la entrada de auditoría en la misma transacción (actor sistema)', async () => {
    const p = await service.crear({ nombre: 'Con auditoría' });
    const auditorias = await dataSource.getRepository(Auditoria).find();
    expect(auditorias).toHaveLength(1);
    expect(auditorias[0].accion).toBe('proyecto.crear');
    expect(auditorias[0].recursoId).toBe(p.id);
    expect(auditorias[0].actorTipo).toBe('sistema');
    expect(auditorias[0].detalle).toEqual({ nombre: 'Con auditoría' });
  });

  afterAll(async () => {
    await dataSource.destroy();
  });
});
