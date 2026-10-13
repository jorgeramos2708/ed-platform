import { Injectable, LoggerService } from '@nestjs/common';
import { SanitizadorService } from '../secretos/sanitizador.service';

export interface LineaLog {
  ts: string;
  nivel: string;
  contexto?: string;
  mensaje: unknown;
  datos?: unknown;
}

// Logger estructurado (JSON por línea) con redacción GARANTIZADA: toda línea pasa por el
// sanitizador antes de escribirse — ningún valor de secreto puede aparecer en los logs
// (CONSTRAINTS §1.2, criterio de la puerta M1). Implementa LoggerService de Nest.
@Injectable()
export class LoggerSeguro implements LoggerService {
  private escribir: (linea: string) => void = (linea) => console.log(linea);

  constructor(private readonly sanitizador: SanitizadorService) {}

  // Para tests: capturar la salida en memoria
  conSalida(escribir: (linea: string) => void): this {
    this.escribir = escribir;
    return this;
  }

  log(mensaje: unknown, contexto?: string, datos?: unknown): void {
    this.emitir('log', mensaje, contexto, datos);
  }

  error(mensaje: unknown, traza?: string, contexto?: string): void {
    this.emitir('error', mensaje, contexto, traza ? { traza } : undefined);
  }

  warn(mensaje: unknown, contexto?: string, datos?: unknown): void {
    this.emitir('warn', mensaje, contexto, datos);
  }

  debug(mensaje: unknown, contexto?: string, datos?: unknown): void {
    this.emitir('debug', mensaje, contexto, datos);
  }

  verbose(mensaje: unknown, contexto?: string, datos?: unknown): void {
    this.emitir('verbose', mensaje, contexto, datos);
  }

  private emitir(nivel: string, mensaje: unknown, contexto?: string, datos?: unknown): void {
    const linea: LineaLog = {
      ts: new Date().toISOString(),
      nivel,
      ...(contexto ? { contexto } : {}),
      mensaje: this.sanitizador.sanitizar(mensaje),
      ...(datos ? { datos: this.sanitizador.sanitizar(datos) } : {}),
    };
    this.escribir(JSON.stringify(linea));
  }
}
