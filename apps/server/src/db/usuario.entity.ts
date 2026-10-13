import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum RolUsuario {
  Admin = 'admin',
  Desarrollador = 'desarrollador',
  Operador = 'operador',
  Espectador = 'espectador',
}

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  nombre!: string;

  @Column({ type: 'enum', enum: RolUsuario, enumName: 'rol_usuario' })
  rol!: RolUsuario;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  creadoEn!: Date;
}
