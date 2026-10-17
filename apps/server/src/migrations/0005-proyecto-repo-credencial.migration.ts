import { MigrationInterface, QueryRunner } from 'typeorm';

// Fase 3: credenciales por referencia — el proyecto nombra qué secreto del vault usa para su remoto
export class ProyectoRepoCredencialMigracion1771000000004 implements MigrationInterface {
  name = 'ProyectoRepoCredencialMigracion1771000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS "repoCredencial" varchar(64) NULL;`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE proyectos DROP COLUMN IF EXISTS "repoCredencial";`);
  }
}
