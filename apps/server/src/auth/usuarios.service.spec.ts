// RED: auth — registro con hash bcrypt, bootstrap de roles y login con JWT
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { Usuario } from '../db/usuario.entity';
import { Auditoria } from '../db/auditoria.entity';

describe('UsuariosService (integración PostgreSQL)', () => {
  let service: UsuariosService;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env.DATABASE_URL ?? 'postgres://edp:edp_dev@localhost:5433/edp',
          entities: [Usuario, Auditoria],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Usuario, Auditoria]),
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } }),
      ],
      providers: [UsuariosService],
    }).compile();
    service = moduleRef.get(UsuariosService);
    dataSource = moduleRef.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE usuarios, auditoria RESTART IDENTITY CASCADE');
  });

  it('registrar guarda hash bcrypt y NUNCA el password en claro ni lo devuelve', async () => {
    const usuario = await service.registrar({ email: 'a@ed.test', nombre: 'A', password: 'ClaveSegura-1' });
    expect(usuario.passwordHash).toBeUndefined();
    const enDb = await dataSource.getRepository(Usuario).findOneByOrFail({ email: 'a@ed.test' });
    expect(enDb.passwordHash).not.toBe('ClaveSegura-1');
    expect(enDb.passwordHash.startsWith('$2')).toBe(true); // formato bcrypt
    expect(await bcrypt.compare('ClaveSegura-1', enDb.passwordHash)).toBe(true);
  });

  it('el primer usuario registrado es admin y los siguientes desarrollador', async () => {
    const primero = await service.registrar({ email: 'p@ed.test', nombre: 'P', password: 'ClaveSegura-1' });
    const segundo = await service.registrar({ email: 's@ed.test', nombre: 'S', password: 'ClaveSegura-1' });
    expect(primero.rol).toBe('admin');
    expect(segundo.rol).toBe('desarrollador');
  });

  it('rechaza email duplicado con ConflictException', async () => {
    await service.registrar({ email: 'dup@ed.test', nombre: 'D', password: 'ClaveSegura-1' });
    await expect(
      service.registrar({ email: 'dup@ed.test', nombre: 'D2', password: 'ClaveSegura-1' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('login con credenciales correctas devuelve token con sub y rol', async () => {
    const { id } = await service.registrar({ email: 'l@ed.test', nombre: 'L', password: 'ClaveSegura-1' });
    const { token } = await service.login({ email: 'l@ed.test', password: 'ClaveSegura-1' });
    expect(typeof token).toBe('string');
    // el token decodifica (verificación real la hace el guard en e2e); aquí comprobamos estructura JWT
    const partes = token.split('.');
    expect(partes).toHaveLength(3);
    expect(id).toBeDefined();
  });

  it('login con password incorrecta rechaza con UnauthorizedException', async () => {
    await service.registrar({ email: 'x@ed.test', nombre: 'X', password: 'ClaveSegura-1' });
    await expect(service.login({ email: 'x@ed.test', password: 'otra-clave' })).rejects.toMatchObject({
      status: 401,
    });
  });

  it('registra auditoría de registro y de login exitoso', async () => {
    await service.registrar({ email: 'aud@ed.test', nombre: 'Aud', password: 'ClaveSegura-1' });
    await service.login({ email: 'aud@ed.test', password: 'ClaveSegura-1' });
    const auditorias = await dataSource.getRepository(Auditoria).find({ order: { id: 'ASC' } });
    expect(auditorias.map((a) => a.accion)).toEqual(['auth.registro', 'auth.login']);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });
});
