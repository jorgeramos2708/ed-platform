import { MigrationInterface, QueryRunner } from 'typeorm';

// Migración inicial: esquema completo de Fase 1 (entregables M1).
// Una sola fuente de verdad: synchronize queda DESACTIVADO en todos los entornos.
// Columnas camelCase (decisión de naming v1: coincide con las entidades; cualquier cambio de
// naming se hará con migración de renombrado, nunca editando el esquema a mano).
export class MigracionInicial1771000000000 implements MigrationInterface {
  name = 'MigracionInicial1771000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Enums (idempotentes)
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE rol_usuario AS ENUM ('admin','desarrollador','operador','espectador');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE clasificacion_proyecto AS ENUM ('local','nube_con_exclusiones');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE actor_tipo AS ENUM ('usuario','ia','worker','sistema');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE estado_trabajo AS ENUM ('created','retry','active','completed','cancelled','failed');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS usuarios (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "email" varchar NOT NULL,
      "nombre" varchar NOT NULL,
      "rol" rol_usuario NOT NULL,
      "passwordHash" varchar NOT NULL,
      "activo" boolean NOT NULL DEFAULT true,
      "creadoEn" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_usuarios" PRIMARY KEY ("id")
    );`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_usuarios_email" ON usuarios ("email");`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS proyectos (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "nombre" varchar NOT NULL,
      "slug" varchar NOT NULL,
      "repoUrl" text,
      "clasificacion" clasificacion_proyecto NOT NULL DEFAULT 'local',
      "creadoPorId" uuid,
      "creadoEn" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_proyectos" PRIMARY KEY ("id")
    );`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_proyectos_slug" ON proyectos ("slug");`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS auditoria (
      "id" serial NOT NULL,
      "actorId" varchar NOT NULL,
      "actorTipo" actor_tipo NOT NULL,
      "accion" varchar NOT NULL,
      "recursoTipo" varchar NOT NULL,
      "recursoId" varchar NOT NULL,
      "detalle" jsonb,
      "creadoEn" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_auditoria" PRIMARY KEY ("id")
    );`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS secretos (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "proyectoId" uuid,
      "nombre" varchar NOT NULL,
      "encDek" bytea NOT NULL,
      "dekIv" bytea NOT NULL,
      "dekTag" bytea NOT NULL,
      "ciphertext" bytea NOT NULL,
      "iv" bytea NOT NULL,
      "tag" bytea NOT NULL,
      "creadoPorId" uuid,
      "creadoEn" timestamptz NOT NULL DEFAULT now(),
      "rotadoEn" timestamptz,
      "expiraEn" timestamptz,
      CONSTRAINT "PK_secretos" PRIMARY KEY ("id")
    );`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS trabajos (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "pgbossJobId" uuid,
      "tipo" varchar NOT NULL,
      "payloadRef" jsonb NOT NULL,
      "estadoEspejo" estado_trabajo NOT NULL,
      "intentos" integer NOT NULL DEFAULT 0,
      "resultado" jsonb,
      "proyectoId" uuid,
      "creadoEn" timestamptz NOT NULL DEFAULT now(),
      "actualizadoEn" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_trabajos" PRIMARY KEY ("id")
    );`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS trabajos;`);
    await queryRunner.query(`DROP TABLE IF EXISTS secretos;`);
    await queryRunner.query(`DROP TABLE IF EXISTS auditoria;`);
    await queryRunner.query(`DROP TABLE IF EXISTS proyectos;`);
    await queryRunner.query(`DROP TABLE IF EXISTS usuarios;`);
    await queryRunner.query(`DROP TYPE IF EXISTS estado_trabajo;`);
    await queryRunner.query(`DROP TYPE IF EXISTS actor_tipo;`);
    await queryRunner.query(`DROP TYPE IF EXISTS clasificacion_proyecto;`);
    await queryRunner.query(`DROP TYPE IF EXISTS rol_usuario;`);
  }
}
