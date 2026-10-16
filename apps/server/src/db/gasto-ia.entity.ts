import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Libro mayor de gasto de IA por llamada (E05: límites de gasto) — complementa ejecuciones_ia.
// Una fila por llamada al proveedor: el total por proyecto alimenta el límite de gasto acumulado.
@Entity('gasto_ia')
export class GastoIa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  proyectoId!: string;

  @Column({ type: 'varchar' })
  proveedor!: string;

  @Column({ type: 'integer', default: 0 })
  tokensEntrada!: number;

  @Column({ type: 'integer', default: 0 })
  tokensSalida!: number;

  @CreateDateColumn()
  creadoEn!: Date;
}
