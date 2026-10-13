// RED: e2e — solo admin gestiona secretos (matriz E03); la API jamás expone valores
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('Secretos (e2e, matriz E03)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const registrarYLogin = async (email: string) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({ email, nombre: email, password: 'ClaveSegura-1' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'ClaveSegura-1' })
      .expect(200);
    return login.body.token as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE proyectos, usuarios, secretos, auditoria RESTART IDENTITY CASCADE');
  });

  it('admin crea un secreto y el listado NO devuelve el valor', async () => {
    // La BD quedó truncada: el primer usuario registrado es admin
    const token = await registrarYLogin('admin@ed.test');
    const res = await request(app.getHttpServer())
      .post('/api/secretos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'API_KEY', valor: 'sk-oculta-999' })
      .expect(201);
    expect(JSON.stringify(res.body)).not.toContain('sk-oculta-999');
    const lista = await request(app.getHttpServer())
      .get('/api/secretos')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(JSON.stringify(lista.body)).not.toContain('sk-oculta-999');
    expect(lista.body[0].nombre).toBe('API_KEY');
  });

  it('desarrollador NO puede crear secretos → 403 auditado (matriz E03)', async () => {
    await registrarYLogin('admin@ed.test'); // primero = admin
    const tokenDev = await registrarYLogin('dev@ed.test'); // segundo = desarrollador
    const res = await request(app.getHttpServer())
      .post('/api/secretos')
      .set('Authorization', `Bearer ${tokenDev}`)
      .send({ nombre: 'X', valor: 'y' })
      .expect(403);
    expect(res.body.message).toContain('Rol insuficiente');
    const denegada = await dataSource.query(
      "SELECT * FROM auditoria WHERE accion = 'auth.denegado' LIMIT 1",
    );
    expect(denegada.length).toBe(1);
  });

  afterAll(async () => {
    await app.close();
  });
});
