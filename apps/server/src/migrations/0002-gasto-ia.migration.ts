import { MigrationInterface, QueryRunner } from 'typeorm';

// F2-5b: libro mayor de gasto de IA por llamada (E05, límites de gasto acumulado por proyecto)
export class GastoIaMigracion1771000000001 implements MigrationInterface {
  name = 'GastoIaMigracion1771000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS gasto_ia (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "proyectoId" uuid NOT NULL,
      proveedor varchar NOT NULL,
      "tokensEntrada" integer NOT NULL DEFAULT 0,
      "tokensSalida" integer NOT NULL DEFAULT 0,
      "creadoEn" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_gasto_ia" PRIMARY KEY ("id")
    );`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_gasto_ia_proyecto" ON gasto_ia ("proyectoId");`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS gasto_ia;`);
  }
}
