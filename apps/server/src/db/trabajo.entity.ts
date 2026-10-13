import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Espejo de los estados REALES de pg-boss v12 (spike S3): created/retry/active/completed/cancelled/failed
export enum EstadoTrabajo {
  Created = 'created',
  Retry = 'retry',
  Active = 'active',
  Completed = 'completed',
  Cancelled = 'cancelled',
  Failed = 'failed',
}

// tipo como varchar: cada módulo registra sus tipos de trabajo; el enum de negocio del
// modelo de datos (ci/despliegue/ia_tarea/mantenimiento) gobierna los tipos de dominio
@Entity('trabajos')
export class Trabajo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  pgbossJobId!: string | null;

  @Column({ type: 'varchar' })
  tipo!: string;

  // payload SIN secretos — referencias a recursos (modelo-datos §6)
  @Column({ type: 'jsonb' })
  payloadRef!: Record<string, unknown>;

  @Column({ type: 'enum', enum: EstadoTrabajo, enumName: 'estado_trabajo' })
  estadoEspejo!: EstadoTrabajo;

  @Column({ type: 'int', default: 0 })
  intentos!: number;

  @Column({ type: 'jsonb', nullable: true })
  resultado!: Record<string, unknown> | null;

  @Column({ type: 'uuid', nullable: true })
  proyectoId!: string | null;

  @CreateDateColumn()
  creadoEn!: Date;

  @UpdateDateColumn()
  actualizadoEn!: Date;
}
