import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Fase 4 (E08): servidor del catálogo — la credencial va POR REFERENCIA al vault (nunca inline)
@Entity('servidores')
export class Servidor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  nombre!: string;

  @Column({ type: 'varchar', length: 253 })
  host!: string;

  @Column({ type: 'integer', default: 22 })
  puerto!: number;

  // FK lógica → secretos.id (la contraseña o clave privada cifrada vive SOLO en el vault)
  @Column({ type: 'uuid' })
  credencialId!: string;

  // Usuario SSH en el servidor remoto (por defecto root)
  @Column({ type: 'varchar', length: 64, default: 'root' })
  usuarioSsh!: string;

  @CreateDateColumn()
  creadoEn!: Date;
}
