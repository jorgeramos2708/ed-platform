import { ProveedorIA, QuotaError, RespuestaIA, SolicitudIA } from '../proveedor-ia';

export interface OpcionesAnthropic {
  nombre: string;
  apiKey: string;
  modelo: string;
  baseUrl?: string;
}

export class ProveedorAnthropic implements ProveedorIA {
  readonly nombre: string;

  constructor(private readonly opciones: OpcionesAnthropic) {
    this.nombre = opciones.nombre;
  }

  async ejecutar(solicitud: SolicitudIA): Promise<RespuestaIA> {
    const baseUrl = this.opciones.baseUrl ?? 'https://api.anthropic.com';
    // El rol system viaja como campo aparte en la API de Anthropic (no como mensaje)
    const system = solicitud.mensajes.filter((m) => m.rol === 'system').map((m) => m.contenido).join('\n');
    const mensajes = solicitud.mensajes
      .filter((m) => m.rol !== 'system')
      .map((m) => ({ role: m.rol, content: m.contenido }));

    const respuesta = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.opciones.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.opciones.modelo,
        max_tokens: solicitud.maxTokens ?? 2048,
        ...(system ? { system } : {}),
        messages: mensajes,
      }),
      signal: AbortSignal.timeout(120000),
    });

    // 429 (rate limit) y 529 (overloaded) → failover (S5)
    if (respuesta.status === 429 || respuesta.status === 529) throw new QuotaError(this.opciones.nombre);
    if (!respuesta.ok) {
      throw new Error(`proveedor ${this.opciones.nombre}: HTTP ${respuesta.status} — ${await respuesta.text()}`);
    }

    const datos = (await respuesta.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      contenido: datos.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('') ?? '',
      uso: {
        entrada: datos.usage?.input_tokens ?? 0,
        salida: datos.usage?.output_tokens ?? 0,
      },
      proveedor: this.opciones.nombre,
    };
  }
}
