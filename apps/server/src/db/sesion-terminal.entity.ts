import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// F4-3: sesión de terminal — auditoría de quién abrió una PTY en qué servidor y cuándo se cerró
@Entity('sesiones_terminal')
export class SesionTerminal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  usuarioId!: string;

  @Column({ type: 'uuid' })
  servidorId!: string;

  @CreateDateColumn()
  abiertaEn!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  cerradaEn!: Date | null;
}
