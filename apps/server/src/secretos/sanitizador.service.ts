import { Injectable } from '@nestjs/common';

// Registro en memoria de valores prohibidos: todo valor de secreto que la app maneja
// (crear/usar) se registra aquí, y los logs se pasan por sanitizar() antes de escribirse.
// La redacción es regla de CONSTRAINTS §1.2 y criterio de la puerta M1.
// (Se provee desde CoreModule @Global — una sola instancia compartida)
@Injectable()
export class SanitizadorService {
  private prohibidos = new Set<string>();

  registrarValor(valor: string): void {
    if (valor) this.prohibidos.add(valor);
  }

  get valoresRegistrados(): number {
    return this.prohibidos.size;
  }

  // Reemplaza toda aparición de un valor prohibido por [REDACTADO], en profundidad
  sanitizar<T>(entrada: T): T {
    return this.recursal(entrada) as T;
  }

  private recursal(v: unknown): unknown {
    if (typeof v === 'string') {
      let salida = v;
      for (const prohibido of this.prohibidos) {
        if (prohibido && salida.includes(prohibido)) {
          salida = salida.split(prohibido).join('[REDACTADO]');
        }
      }
      return salida;
    }
    if (Array.isArray(v)) return v.map((x) => this.recursal(x));
    if (v && typeof v === 'object') {
      const salida: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        salida[k] = this.recursal(val);
      }
      return salida;
    }
    return v;
  }
}
