import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Fase 4: permiso por usuario/servidor/acción — SIN permiso concedido, el acceso es denegado
@Entity('permisos_servidor')
export class PermisoServidor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  usuarioId!: string;

  @Column({ type: 'uuid' })
  servidorId!: string;

  // Lista separada por comas: ejecutar, terminal, sftp
  @Column({ type: 'varchar', length: 120, default: 'ejecutar' })
  acciones!: string;

  @CreateDateColumn()
  creadoEn!: Date;
}
