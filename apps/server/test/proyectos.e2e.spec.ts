// e2e actualizado a la realidad con auth: los endpoints exigen Bearer (matriz de permisos)
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('ProyectosController (e2e, con auth)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE proyectos, usuarios, auditoria RESTART IDENTITY CASCADE');
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({ email: 'dev@ed.test', nombre: 'Dev', password: 'ClaveSegura-1' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'dev@ed.test', password: 'ClaveSegura-1' })
      .expect(200);
    token = login.body.token;
  });

  it('POST /api/proyectos con Bearer crea y devuelve el proyecto con slug derivado', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/proyectos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Proyecto E2E' })
      .expect(201);
    expect(res.body.slug).toBe('proyecto-e2e');
  });

  it('GET /api/proyectos lista los proyectos creados', async () => {
    await request(app.getHttpServer())
      .post('/api/proyectos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Uno' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get('/api/proyectos')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].nombre).toBe('Uno');
  });

  afterAll(async () => {
    await app.close();
  });
});
