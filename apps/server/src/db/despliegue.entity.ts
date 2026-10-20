import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// F6: máquina de estados del despliegue — NUNCA 'exitoso' sin versión detectada == esperada
// Y health en verde (comando terminado ≠ aplicación saludable, puerta Fase 6)
@Entity('despliegues')
export class Despliegue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  entornoId!: string;

  @Column({ type: 'uuid' })
  servidorId!: string;

  @Column({ type: 'uuid' })
  artefactoId!: string;

  @Column({ type: 'varchar', length: 20, default: 'pendiente' })
  estado!: string; // pendiente | desplegando | verificando | exitoso | fallido | en_rollback

  @Column({ type: 'varchar', length: 20, default: 'recreate' })
  estrategia!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  versionEsperada!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  versionDetectada!: string | null;

  @Column({ type: 'varchar', length: 253, nullable: true })
  healthUrl!: string | null;

  @Column({ type: 'uuid', nullable: true })
  aprobadoPor!: string | null;

  @Column({ type: 'uuid', nullable: true })
  desplieguePrevioId!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn()
  creadoEn!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  terminadoEn!: Date | null;
}
