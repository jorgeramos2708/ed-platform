import { Inject, Injectable } from '@nestjs/common';
import { CADENA_PROVEEDORES, MensajeIA } from './proveedor-ia';

// Chat conversacional por proyecto: el cliente mantiene el historial y envía los mensajes;
// el servicio hace failover por la cadena (S5) y responde
@Injectable()
export class ChatService {
  constructor(@Inject(CADENA_PROVEEDORES) private readonly proveedores: ProveedorIA[]) {}

  tieneProveedores(): boolean {
    return this.proveedores.length > 0;
  }

  async responder(mensajes: MensajeIA[]): Promise<{ respuesta: string; proveedor: string }> {
    if (!this.proveedores.length) throw new Error('Sin proveedores de IA configurados');
    for (const proveedor of this.proveedores) {
      try {
        const r = await proveedor.ejecutar({ mensajes, maxTokens: 2048 });
        return { respuesta: r.contenido, proveedor: proveedor.nombre };
      } catch (e) {
        if (!(e instanceof Error) || e.name !== 'QuotaError') throw e; // solo cuota hace failover
      }
    }
    throw new Error('Todos los proveedores agotaron cuota');
  }
}
