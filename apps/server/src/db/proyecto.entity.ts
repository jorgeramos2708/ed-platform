import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum ClasificacionProyecto {
  Local = 'local',
  NubeConExclusiones = 'nube_con_exclusiones',
}

// creadoPorId es uuid sin FK física por ahora: la relación se añade con auth (Fase 1, slice 3)
@Entity('proyectos')
export class Proyecto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  nombre!: string;

  @Column({ unique: true })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  repoUrl!: string | null;

  // Rama por defecto del remoto (Fase 3): 'main' por convención
  @Column({ type: 'varchar', length: 64, default: 'main' })
  ramaDefault!: string;

  // Último hash conocido del remoto (F3-4: el sondeo lo compara y audita avances)
  @Column({ type: 'varchar', length: 40, nullable: true })
  remotoHead!: string | null;

  @Column({
    type: 'enum',
    enum: ClasificacionProyecto,
    enumName: 'clasificacion_proyecto',
    default: ClasificacionProyecto.Local,
  })
  clasificacion!: ClasificacionProyecto;

  @Column({ type: 'uuid', nullable: true })
  creadoPorId!: string | null;

  @CreateDateColumn()
  creadoEn!: Date;
}
