import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// F6: los pasos del despliegue (detener, copiar artefacto, arrancar, verificar health/versión,
// rollback) quedan registrados con su detalle — el reporte del despliegue
@Entity('despliegue_pasos')
export class DesplieguePaso {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  despliegueId!: string;

  @Column({ type: 'varchar', length: 120 })
  nombre!: string;

  @Column({ type: 'varchar', length: 20, default: 'pendiente' })
  estado!: string;

  @Column({ type: 'text', default: '' })
  detalle!: string;

  @Column({ type: 'integer' })
  orden!: number;

  @CreateDateColumn()
  creadoEn!: Date;
}
