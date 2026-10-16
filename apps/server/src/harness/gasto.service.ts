import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GastoIa } from '../db/gasto-ia.entity';
import { UsoTokens } from './proveedor-ia';

// Gasto de IA persistente (E05, límites de gasto): un libro mayor por llamada.
// El harness lo registra tras cada respuesta y consulta el total del proyecto
// para aplicar el límite ACUMULADO (no solo por tarea).
@Injectable()
export class GastoService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async registrar(proyectoId: string, proveedor: string, uso: UsoTokens): Promise<void> {
    const repo = this.dataSource.getRepository(GastoIa);
    await repo.save(
      repo.create({
        proyectoId,
        proveedor,
        tokensEntrada: uso.entrada,
        tokensSalida: uso.salida,
      }),
    );
  }

  // Total de tokens (entrada + salida) gastados por el proyecto en toda su historia
  async totalDelProyecto(proyectoId: string): Promise<number> {
    const filas = await this.dataSource.getRepository(GastoIa).findBy({ proyectoId });
    return filas.reduce(
      (total, fila) => total + fila.tokensEntrada + fila.tokensSalida,
      0,
    );
  }
}
