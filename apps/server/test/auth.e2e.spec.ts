// RED: e2e — registro/login HTTP, guard JWT y guard de roles con denegación auditada
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { Usuario, RolUsuario } from '../src/db/usuario.entity';
import { Auditoria } from '../src/db/auditoria.entity';

describe('Auth + proyectos protegidos (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE proyectos, usuarios, auditoria RESTART IDENTITY CASCADE');
  });

  it('registro → login → crear proyecto con Bearer funciona y audita al usuario', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({ email: 'dev@ed.test', nombre: 'Dev', password: 'ClaveSegura-1' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'dev@ed.test', password: 'ClaveSegura-1' })
      .expect(200);
    expect(login.body.token).toBeDefined();
    expect(login.body.usuario.passwordHash).toBeUndefined(); // nunca expone el hash

    const creado = await request(app.getHttpServer())
      .post('/api/proyectos')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ nombre: 'Con Token' })
      .expect(201);
    const auditoria = await dataSource.getRepository(Auditoria).find({ order: { id: 'ASC' } });
    const audCrear = auditoria.find((a) => a.accion === 'proyecto.crear');
    expect(audCrear?.actorTipo).toBe('usuario');
    expect(audCrear?.actorId).toBe(creado.body.creadoPorId);
  });

  it('crear proyecto sin token → 401', async () => {
    await request(app.getHttpServer()).post('/api/proyectos').send({ nombre: 'X' }).expect(401);
  });

  it('crear proyecto con rol espectador → 403 y la denegación queda auditada', async () => {
    const hash = await bcrypt.hash('ClaveSegura-1', 10);
    await dataSource.getRepository(Usuario).save({
      email: 'esp@ed.test',
      nombre: 'Esp',
      rol: RolUsuario.Espectador,
      passwordHash: hash,
      activo: true,
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'esp@ed.test', password: 'ClaveSegura-1' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/proyectos')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ nombre: 'Prohibido' })
      .expect(403);
    const denegada = await dataSource.getRepository(Auditoria).findOneBy({ accion: 'auth.denegado' });
    expect(denegada?.actorTipo).toBe('usuario');
    expect(denegada?.detalle).toMatchObject({ rolActual: 'espectador' });
  });

  it('login con password incorrecta → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({ email: 'bad@ed.test', nombre: 'Bad', password: 'ClaveSegura-1' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'bad@ed.test', password: 'incorrecta' })
      .expect(401);
  });

  afterAll(async () => {
    await app.close();
  });
});
