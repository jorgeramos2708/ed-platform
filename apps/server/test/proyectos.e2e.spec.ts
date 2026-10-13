// RED: e2e HTTP contra AppModule completo (supertest)
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('ProyectosController (e2e)', () => {
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

  it('POST /api/proyectos crea y devuelve el proyecto con slug derivado', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/proyectos')
      .send({ nombre: 'Proyecto E2E' })
      .expect(201);
    expect(res.body.slug).toBe('proyecto-e2e');
  });

  it('GET /api/proyectos lista los proyectos creados', async () => {
    await request(app.getHttpServer()).post('/api/proyectos').send({ nombre: 'Uno' }).expect(201);
    const res = await request(app.getHttpServer()).get('/api/proyectos').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].nombre).toBe('Uno');
  });

  afterAll(async () => {
    await app.close();
  });
});
