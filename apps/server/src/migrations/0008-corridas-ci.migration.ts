import { MigrationInterface, QueryRunner } from 'typeorm';

// F5-2 (E09): corridas de CI + etapas con logs + artefactos asociados al commit.
// La puerta: resultados y artefactos consultables tras reiniciar (persisten en BD).
export class CorridasCiMigracion1771000000007 implements MigrationInterface {
  name = 'CorridasCiMigracion1771000000007';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS corridas_ci (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      "proyectoId" uuid NOT NULL,
      "commitSha" varchar(40) NOT NULL,
      estado varchar(20) NOT NULL DEFAULT 'pendiente',
      "pipelinePath" varchar(120) NOT NULL DEFAULT '.edp-pipeline.yml',
      "iniciadoEn" timestamptz NOT NULL DEFAULT now(),
      "terminadoEn" timestamptz NULL,
      CONSTRAINT "PK_corridas_ci" PRIMARY KEY (id)
    );`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS corrida_etapas (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      "corridaId" uuid NOT NULL,
      nombre varchar(120) NOT NULL,
      estado varchar(20) NOT NULL DEFAULT 'pendiente',
      salida text NOT NULL DEFAULT '',
      "iniciadoEn" timestamptz NULL,
      "terminadoEn" timestamptz NULL,
      CONSTRAINT "PK_corrida_etapas" PRIMARY KEY (id),
      CONSTRAINT "FK_corrida_etapas_corrida" FOREIGN KEY ("corridaId") REFERENCES corridas_ci(id) ON DELETE CASCADE
    );`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS artefactos (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      "corridaId" uuid NOT NULL,
      etiqueta varchar(120) NOT NULL,
      "rutaRelativa" varchar(253) NOT NULL,
      digest varchar(64) NOT NULL,
      contenido bytea NOT NULL,
      "creadoEn" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_artefactos" PRIMARY KEY (id),
      CONSTRAINT "FK_artefactos_corrida" FOREIGN KEY ("corridaId") REFERENCES corridas_ci(id) ON DELETE CASCADE
    );`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS artefactos;`);
    await queryRunner.query(`DROP TABLE IF EXISTS corrida_etapas;`);
    await queryRunner.query(`DROP TABLE IF EXISTS corridas_ci;`);
  }
}
