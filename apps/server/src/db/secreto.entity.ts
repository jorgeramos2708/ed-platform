import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Modelo-datos §5: solo material cifrado (bytea) + metadatos; el NOMBRE queda en claro por diseño
@Entity('secretos')
export class Secreto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  proyectoId!: string | null;

  @Column()
  nombre!: string;

  // DEK envuelta con la clave maestra (AES-256-GCM)
  @Column({ type: 'bytea' })
  encDek!: Buffer;

  @Column({ type: 'bytea' })
  dekIv!: Buffer;

  @Column({ type: 'bytea' })
  dekTag!: Buffer;

  // Valor cifrado con la DEK
  @Column({ type: 'bytea' })
  ciphertext!: Buffer;

  @Column({ type: 'bytea' })
  iv!: Buffer;

  @Column({ type: 'bytea' })
  tag!: Buffer;

  @Column({ type: 'uuid', nullable: true })
  creadoPorId!: string | null;

  @CreateDateColumn()
  creadoEn!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  rotadoEn!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiraEn!: Date | null;
}
