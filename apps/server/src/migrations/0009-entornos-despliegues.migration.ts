import { MigrationInterface, QueryRunner } from 'typeorm';

// Fase 6 (E10): entornos (decisión 5) + despliegues con máquina de estados (puerta Fase 6:
// comando terminado ≠ aplicación saludable — verificación de versión + health + rollback)
export class EntornosYDesplieguesMigracion1771000000008 implements MigrationInterface {
  name = 'EntornosYDesplieguesMigracion1771000000008';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS entornos (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      "proyectoId" uuid NOT NULL,
      nombre varchar(20) NOT NULL,
      "requiereAprobacion" boolean NOT NULL DEFAULT false,
      CONSTRAINT "PK_entornos" PRIMARY KEY (id),
      CONSTRAINT "UQ_entornos_proyecto_nombre" UNIQUE ("proyectoId", nombre)
    );`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS despliegues (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      "entornoId" uuid NOT NULL,
      "servidorId" uuid NOT NULL,
      "artefactoId" uuid NOT NULL,
      estado varchar(20) NOT NULL DEFAULT 'pendiente',
      estrategia varchar(20) NOT NULL DEFAULT 'recreate',
      "versionEsperada" varchar(64) NULL,
      "versionDetectada" varchar(64) NULL,
      "healthUrl" varchar(253) NULL,
      "aprobadoPor" uuid NULL,
      "desplieguePrevioId" uuid NULL,
      error text NULL,
      "creadoEn" timestamptz NOT NULL DEFAULT now(),
      "terminadoEn" timestamptz NULL,
      CONSTRAINT "PK_despliegues" PRIMARY KEY (id),
      CONSTRAINT "FK_despliegues_entorno" FOREIGN KEY ("entornoId") REFERENCES entornos(id) ON DELETE CASCADE,
      CONSTRAINT "FK_despliegues_servidor" FOREIGN KEY ("servidorId") REFERENCES servidores(id) ON DELETE CASCADE
    );`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS despliegue_pasos (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      "despliegueId" uuid NOT NULL,
      nombre varchar(120) NOT NULL,
      estado varchar(20) NOT NULL DEFAULT 'pendiente',
      detalle text NOT NULL DEFAULT '',
      orden integer NOT NULL,
      CONSTRAINT "PK_despliegue_pasos" PRIMARY KEY (id),
      CONSTRAINT "FK_despliegue_pasos_despliegue" FOREIGN KEY ("despliegueId") REFERENCES despliegues(id) ON DELETE CASCADE
    );`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS despliegue_pasos;`);
    await queryRunner.query(`DROP TABLE IF EXISTS despliegues;`);
    await queryRunner.query(`DROP TABLE IF EXISTS entornos;`);
  }
}
