import { MigrationInterface, QueryRunner } from 'typeorm';

// Fase 4: catálogo de servidores (credencial POR REFERENCIA al vault) + permisos por usuario/servidor
export class ServidoresYPermisosMigracion1771000000005 implements MigrationInterface {
  name = 'ServidoresYPermisosMigracion1771000000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS servidores (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      nombre varchar(120) NOT NULL,
      host varchar(253) NOT NULL,
      puerto integer NOT NULL DEFAULT 22,
      "credencialId" uuid NOT NULL,
      "creadoEn" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_servidores" PRIMARY KEY (id)
    );`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS permisos_servidor (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      "usuarioId" uuid NOT NULL,
      "servidorId" uuid NOT NULL,
      acciones varchar(120) NOT NULL DEFAULT 'ejecutar',
      "creadoEn" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_permisos_servidor" PRIMARY KEY (id),
      CONSTRAINT "UQ_permisos_servidor" UNIQUE ("usuarioId", "servidorId"),
      CONSTRAINT "FK_permisos_servidor_servidor" FOREIGN KEY ("servidorId") REFERENCES servidores(id) ON DELETE CASCADE
    );`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS permisos_servidor;`);
    await queryRunner.query(`DROP TABLE IF EXISTS servidores;`);
  }
}
