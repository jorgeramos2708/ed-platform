import { MigrationInterface, QueryRunner } from 'typeorm';

// Fase 3 (Git y remotos): rama por defecto del remoto del proyecto (repo_url ya existía desde F1)
export class ProyectoRamaDefaultMigracion1771000000002 implements MigrationInterface {
  name = 'ProyectoRamaDefaultMigracion1771000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    // El nombre de columna replica la convención camelCase de las entidades (como "repoUrl")
    await queryRunner.query(
      `ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS "ramaDefault" varchar(64) NOT NULL DEFAULT 'main';`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE proyectos DROP COLUMN IF EXISTS "ramaDefault";`);
  }
}
