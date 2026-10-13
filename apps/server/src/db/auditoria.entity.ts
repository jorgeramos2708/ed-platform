import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum ActorTipo {
  Usuario = 'usuario',
  Ia = 'ia',
  Worker = 'worker',
  Sistema = 'sistema',
}

// Append-only: la auditoría solo se inserta, nunca se actualiza ni borra (modelo-datos §12)
@Entity('auditoria')
export class Auditoria {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'varchar' })
  actorId!: string;

  @Column({ type: 'enum', enum: ActorTipo, enumName: 'actor_tipo' })
  actorTipo!: ActorTipo;

  @Column({ type: 'varchar' })
  accion!: string;

  @Column({ type: 'varchar' })
  recursoTipo!: string;

  @Column({ type: 'varchar' })
  recursoId!: string;

  @Column({ type: 'jsonb', nullable: true })
  detalle!: Record<string, unknown> | null;

  @CreateDateColumn()
  creadoEn!: Date;
}
