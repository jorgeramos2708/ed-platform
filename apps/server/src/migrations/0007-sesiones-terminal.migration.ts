import { MigrationInterface, QueryRunner } from 'typeorm';

// F4-3: auditoría de sesiones de terminal (modelo-datos §11, compromiso 5 de trazabilidad)
export class SesionesTerminalMigracion1771000000006 implements MigrationInterface {
  name = 'SesionesTerminalMigracion1771000000006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS sesiones_terminal (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      "usuarioId" uuid NOT NULL,
      "servidorId" uuid NOT NULL,
      "abiertaEn" timestamptz NOT NULL DEFAULT now(),
      "cerradaEn" timestamptz NULL,
      CONSTRAINT "PK_sesiones_terminal" PRIMARY KEY (id)
    );`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sesiones_terminal;`);
  }
}
