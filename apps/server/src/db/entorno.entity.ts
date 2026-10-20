import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Fase 6 (decisión 5): desarrollo/preproduccion/produccion — producción exige aprobación humana
@Entity('entornos')
export class Entorno {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  proyectoId!: string;

  @Column({ type: 'varchar', length: 20 })
  nombre!: string; // desarrollo | preproduccion | produccion

  @Column({ type: 'boolean', default: false })
  requiereAprobacion!: boolean;

  @CreateDateColumn()
  creadoEn!: Date;
}
