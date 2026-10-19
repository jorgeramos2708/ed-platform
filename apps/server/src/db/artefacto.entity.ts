import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// F5-2: artefacto producido por una corrida — digest sha256 para integridad,
// etiqueta para el despliegue del CD (imagen:revisión)
@Entity('artefactos')
export class Artefacto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  corridaId!: string;

  @Column({ type: 'varchar', length: 120 })
  etiqueta!: string;

  @Column({ type: 'varchar', length: 253 })
  rutaRelativa!: string;

  @Column({ type: 'varchar', length: 64 })
  digest!: string;

  @Column({ type: 'bytea' })
  contenido!: Buffer;

  @CreateDateColumn()
  creadoEn!: Date;
}
