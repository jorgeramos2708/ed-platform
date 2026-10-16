import { MigrationInterface, QueryRunner } from 'typeorm';

// F3-4: último hash conocido del remoto del proyecto (el sondeo compara y audita avances)
export class ProyectoRemotoHeadMigracion1771000000003 implements MigrationInterface {
  name = 'ProyectoRemotoHeadMigracion1771000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS "remotoHead" varchar(40) NULL;`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE proyectos DROP COLUMN IF EXISTS "remotoHead";`);
  }
}
