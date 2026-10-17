// RED: F4-1 — catálogo de servidores con credencial por referencia y permisos por usuario/servidor
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ServidoresService } from './servidores.service';
import { Servidor } from '../db/servidor.entity';
import { PermisoServidor } from '../db/permiso-servidor.entity';
import { Secreto } from '../db/secreto.entity';
import { Usuario } from '../db/usuario.entity';
import { Auditoria } from '../db/auditoria.entity';

describe('ServidoresService (integración PostgreSQL)', () => {
  let service: ServidoresService;
  const uuidUsuarioA = randomUuid();
  const uuidUsuarioB = randomUuid();
  const uuidUsuarioC = randomUuid();
  const uuidUsuarioD = randomUuid();
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env.DATABASE_URL ?? 'postgres://edp:edp_dev@localhost:5433/edp',
          entities: [Servidor, PermisoServidor, Secreto, Usuario, Auditoria],
          synchronize: true, // solo este spec: las migraciones 0006 van al esquema de la app
        }),
        TypeOrmModule.forFeature([Servidor, PermisoServidor, Secreto, Usuario, Auditoria]),
      ],
      providers: [ServidoresService],
    }).compile();
    service = moduleRef.get(ServidoresService);
    dataSource = moduleRef.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE permisos_servidor, servidores, secretos, usuarios, auditoria RESTART IDENTITY CASCADE');
  });

  async function crearCredencial(nombre: string): Promise<string> {
    const secretoRepo = dataSource.getRepository(Secreto);
    const s = await secretoRepo.save(
      secretoRepo.create({ nombre, encDek: Buffer.from('d'), dekIv: Buffer.from('i'), dekTag: Buffer.from('t'), ciphertext: Buffer.from('c'), iv: Buffer.from('v'), tag: Buffer.from('g') }),
    );
    return s.id;
  }

  it('crea un servidor con credencial por referencia (id de secreto) y audita', async () => {
    const credencialId = await crearCredencial('ssh-dev');
    const s = await service.crear({ nombre: 'Servidor Dev', host: '192.168.1.50', puerto: 2222, credencialId });
    expect(s.nombre).toBe('Servidor Dev');
    expect(s.credencialId).toBe(credencialId);
    const audit = await dataSource.getRepository(Auditoria).findOneByOrFail({ accion: 'servidor.crear' });
    expect(audit.recursoId).toBe(s.id);
  });

  it('rechaza credencial inexistente (referencia rota no permitida) y host/puerto inválidos', async () => {
    await expect(
      service.crear({ nombre: 'X', host: 'host.invalido', puerto: 22, credencialId: randomUuid() }),
    ).rejects.toThrow(/no existe/i);
    await expect(
      service.crear({ nombre: 'X', host: 'host ok', puerto: 99999, credencialId: randomUuid() }),
    ).rejects.toThrow();
  });

  it('listar respeta permisos: sin conceder, el usuario no ve el servidor', async () => {
    const s = await service.crear({ nombre: 'Privado', host: '10.0.0.8', puerto: 22, credencialId: await crearCredencial(randomUuid()) });
    const visto = await service.listarPara(uuidUsuarioA);
    expect(visto).toHaveLength(0);
    await service.concederPermiso(s.id, uuidUsuarioB, ['ejecutar', 'sftp']);
    const lista = await service.listarPara(uuidUsuarioB);
    expect(lista).toHaveLength(1);
    expect(lista[0].acciones).toEqual(['ejecutar', 'sftp']);
  });

  it('concede y revoca permisos (auditoría en ambos)', async () => {
    const s = await service.crear({ nombre: 'S', host: '10.0.0.9', puerto: 22, credencialId: await crearCredencial(randomUuid()) });
    await service.concederPermiso(s.id, uuidUsuarioC, ['terminal']);
    await service.revocarPermiso(s.id, uuidUsuarioC);
    const lista = await service.listarPara(uuidUsuarioC);
    expect(lista).toHaveLength(0);
    const revocaciones = await dataSource.getRepository(Auditoria).findBy({ accion: 'servidor.permiso.revocar' });
    expect(revocaciones).toHaveLength(1);
  });

  it('eliminar quita el servidor y sus permisos en cascada', async () => {
    const s = await service.crear({ nombre: 'Efimero', host: '10.0.0.10', puerto: 22, credencialId: await crearCredencial(randomUuid()) });
    await service.concederPermiso(s.id, uuidUsuarioD, ['ejecutar']);
    await service.eliminar(s.id);
    expect(await dataSource.getRepository(Servidor).findOneBy({ id: s.id })).toBeNull();
    expect(await dataSource.getRepository(PermisoServidor).findBy({ servidorId: s.id })).toHaveLength(0);
  });
});

function randomUuid(): string {
  return (globalThis.crypto as Crypto).randomUUID();
}
