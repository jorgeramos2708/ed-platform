export type EstadoCorrida = 'pendiente' | 'ejecutando' | 'exitosa' | 'fallida' | 'cancelada';
export type EstadoEtapa = 'pendiente' | 'ejecutando' | 'exitosa' | 'fallida';

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// F5-2 (E09): corrida de CI — reproducible por commit (resultados consultables tras reiniciar)
@Entity('corridas_ci')
export class CorridaCi {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  proyectoId!: string;

  @Column({ type: 'varchar', length: 40 })
  commitSha!: string;

  @Column({ type: 'varchar', length: 20, default: 'pendiente' })
  estado!: EstadoCorrida;

  @Column({ type: 'varchar', length: 120, default: '.edp-pipeline.yml' })
  pipelinePath!: string;

  @CreateDateColumn()
  iniciadoEn!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  terminadoEn!: Date | null;
}
