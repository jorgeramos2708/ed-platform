// Tipos e interfaz agnóstica de proveedores de IA (decisión 3: uno principal + uno de respaldo)
export type RolMensaje = 'system' | 'user' | 'assistant';

export interface MensajeIA {
  rol: RolMensaje;
  contenido: string;
}

export interface UsoTokens {
  entrada: number;
  salida: number;
}

export interface SolicitudIA {
  mensajes: MensajeIA[];
  maxTokens?: number;
}

export interface RespuestaIA {
  contenido: string;
  uso: UsoTokens;
  proveedor: string;
}

export interface ProveedorIA {
  readonly nombre: string;
  ejecutar(solicitud: SolicitudIA): Promise<RespuestaIA>;
}

// Clasificación de errores (S5): cuota → failover; transitorio → reintento; permanente → abortar
export class QuotaError extends Error {
  constructor(public readonly proveedor: string) {
    super('cuota agotada');
    this.name = 'QuotaError';
  }
}

export class LimiteGastoError extends Error {
  constructor(public readonly uso: UsoTokens, public readonly limiteTokens: number) {
    super(`límite de gasto excedido: ${uso.entrada + uso.salida} tokens > ${limiteTokens}`);
    this.name = 'LimiteGastoError';
  }
}

export function sumarUso(a: UsoTokens, b: UsoTokens): UsoTokens {
  return { entrada: a.entrada + b.entrada, salida: a.salida + b.salida };
}

// ¿El error es de DISPONIBILIDAD del proveedor (caído, DNS, conexión)? → también failover (S5):
// un proveedor inalcanzable no debe tumbar la tarea si hay respaldo. Los 4xx propios abortan.
export function esErrorDeDisponibilidad(e: unknown): boolean {
  if (e instanceof QuotaError) return true;
  const causa = (e as { cause?: { code?: string } })?.cause?.code ?? '';
  return ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN', 'ETIMEDOUT'].includes(causa);
}

// Token de DI de la cadena de proveedores (en este archivo para evitar imports circulares)
export const CADENA_PROVEEDORES = Symbol('CADENA_PROVEEDORES');
