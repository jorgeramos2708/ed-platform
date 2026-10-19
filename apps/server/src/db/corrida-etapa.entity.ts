import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// F5-2: etapa de una corrida — estado + LOG completo (los logs por etapa de la puerta F5)
@Entity('corrida_etapas')
export class CorridaEtapa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  corridaId!: string;

  @Column({ type: 'varchar', length: 120 })
  nombre!: string;

  @Column({ type: 'varchar', length: 20, default: 'pendiente' })
  estado!: string;

  @Column({ type: 'text', default: '' })
  salida!: string;

  @Column({ type: 'timestamptz', nullable: true })
  iniciadoEn!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  terminadoEn!: Date | null;
}
