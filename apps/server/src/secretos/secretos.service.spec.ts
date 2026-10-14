// RED: vault de secretos — envelope en BD, auditoría, sanitización de logs, sin valores expuestos
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { configuracionBd } from '../db/configuracion-bd';
import { DataSource } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { SecretosService } from './secretos.service';
import { SanitizadorService } from './sanitizador.service';
import { CifradorService } from './cifrador.service';
import { Secreto } from '../db/secreto.entity';
import { Auditoria } from '../db/auditoria.entity';

process.env.EDP_MASTER_KEY = randomBytes(32).toString('hex'); // clave de prueba, fuera del repo

describe('SecretosService (integración PostgreSQL)', () => {
  let service: SecretosService;
  let sanitizador: SanitizadorService;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(configuracionBd()),
        TypeOrmModule.forFeature([Secreto, Auditoria]),
      ],
      providers: [
        SecretosService,
        SanitizadorService,
        { provide: CifradorService, useFactory: () => new CifradorService(Buffer.from(process.env.EDP_MASTER_KEY!, 'hex')) },
      ],
    }).compile();
    service = moduleRef.get(SecretosService);
    sanitizador = moduleRef.get(SanitizadorService);
    dataSource = moduleRef.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE secretos, auditoria RESTART IDENTITY CASCADE');
  });

  it('crear guarda SOLO ciphertext + DEK envuelta (nada en claro) y audita', async () => {
    const secreto = await service.crear({ nombre: 'API_KEY_PROVEEDOR', valor: 'sk-live-1234567890' });
    expect(secreto.ciphertext).toBeUndefined(); // la respuesta no expone material cifrado ni valores
    const fila = await dataSource.getRepository(Secreto).findOneByOrFail({ id: secreto.id });
    const todo = JSON.stringify(fila);
    expect(todo).not.toContain('sk-live-1234567890');
    const auditorias = await dataSource.getRepository(Auditoria).findBy({ accion: 'secreto.crear' });
    expect(auditorias).toHaveLength(1);
    expect(JSON.stringify(auditorias[0].detalle)).not.toContain('sk-live-1234567890');
  });

  it('usar devuelve el valor exacto (inyección just-in-time) y lo registra como prohibido en logs', async () => {
    await service.crear({ nombre: 'SSH_PASS', valor: 'SuPerSecreto-2026' });
    const { valor } = await service.usarPorNombre('SSH_PASS');
    expect(valor).toBe('SuPerSecreto-2026');
    const filtrado = sanitizador.sanitizar('los logs dirían: SuPerSecreto-2026');
    expect(filtrado).not.toContain('SuPerSecreto-2026');
    expect(filtrado).toContain('[REDACTADO]');
  });

  it('el volcado de TODAS las columnas no revela ningún secreto (criterio S6 como regresión)', async () => {
    await service.crear({ nombre: 'TOKEN', valor: 'ghp_abcdefghij123456' });
    await service.crear({ nombre: 'OTRO', valor: 'otro-valor-supersecreto-99' });
    const filas = await dataSource.query('SELECT * FROM secretos');
    const volcado = JSON.stringify(filas);
    expect(volcado).not.toContain('ghp_abcdefghij123456');
    expect(volcado).not.toContain('otro-valor-supersecreto-99');
  });

  it('rotar cambia el ciphertext manteniendo el round-trip con la nueva clave de datos', async () => {
    const s = await service.crear({ nombre: 'ROTAME', valor: 'viejo' });
    await service.rotar(s.id, 'nuevo-valor');
    const { valor } = await service.usarPorNombre('ROTAME');
    expect(valor).toBe('nuevo-valor');
  });

  it('listar devuelve nombres y metadatos, JAMÁS valores ni ciphertext', async () => {
    await service.crear({ nombre: 'LISTAME', valor: 'valor-oculto-77' });
    const lista = await service.listar();
    expect(lista.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(lista)).not.toContain('valor-oculto-77');
    expect(JSON.stringify(lista)).not.toContain('ciphertext');
  });

  afterAll(async () => {
    await dataSource.destroy();
  });
});
