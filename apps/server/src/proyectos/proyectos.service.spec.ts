// RED: integración real contra el PostgreSQL del compose (medio: localhost, BD de desarrollo)
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  const remotosDePrueba = mkdtempSync(join(tmpdir(), 'edp-remotos-spec-'));

  afterAll(() => {
    rmSync(remotosDePrueba, { recursive: true, force: true });
  });

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

  describe('actualizarRemoto (Fase 3: Git y remotos)', () => {
    it('persiste repo_url y rama_default con auditoría', async () => {
      const p = await service.crear({ nombre: 'Con Remoto' });
      const actualizado = await service.actualizarRemoto(p.id, {
        repoUrl: 'https://github.com/jorgeramos2708/edp-m3-test.git',
        ramaDefault: 'main',
      });
      expect(actualizado.repoUrl).toBe('https://github.com/jorgeramos2708/edp-m3-test.git');
      expect(actualizado.ramaDefault).toBe('main');
      const fila = await dataSource.getRepository(Auditoria).findOneByOrFail({ recursoId: p.id, accion: 'proyecto.remoto.configurar' });
      expect(fila.detalle).toBeTruthy();
    });

    it('rechaza repo_url que no sea https:// o git@ (frontera de seguridad)', async () => {
      const p = await service.crear({ nombre: 'Url Rara' });
      await expect(
        service.actualizarRemoto(p.id, { repoUrl: 'file:///etc/passwd' }),
      ).rejects.toThrow(/URL del remoto inválida/);
      await expect(
        service.actualizarRemoto(p.id, { repoUrl: 'http://inseguro.example/repo.git' }),
      ).rejects.toThrow(/URL del remoto inválida/);
    });

    it('acepta file:// SOLO en modo pruebas (EDP_GIT_REMOTOS_DIR) para ensayar la puerta', async () => {
      process.env.EDP_GIT_REMOTOS_DIR = remotosDePrueba;
      try {
        const p = await service.crear({ nombre: 'Remoto Local Pruebas' });
        const r = await service.actualizarRemoto(p.id, { repoUrl: `file://${remotosDePrueba}/origen.git` });
        expect(r.repoUrl).toBe(`file://${remotosDePrueba}/origen.git`);
      } finally {
        delete process.env.EDP_GIT_REMOTOS_DIR;
      }
      // sin el dir de pruebas: file:// sigue prohibido
      const p2 = await service.crear({ nombre: 'Remoto Local Sin Modo' });
      await expect(
        service.actualizarRemoto(p2.id, { repoUrl: `file://${remotosDePrueba}/origen.git` }),
      ).rejects.toThrow(/URL del remoto inválida/);
    });

    it('limpia el remoto con repoUrl null (proyecto solo local otra vez)', async () => {
      const p = await service.crear({ nombre: 'Sin Remoto', repoUrl: 'https://github.com/x/y.git' });
      const limpio = await service.actualizarRemoto(p.id, { repoUrl: null });
      expect(limpio.repoUrl).toBeNull();
    });
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
