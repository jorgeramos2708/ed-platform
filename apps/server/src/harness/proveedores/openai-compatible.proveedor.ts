import { QuotaError, RespuestaIA, SolicitudIA } from '../proveedor-ia';

// Funciona con OpenAI, DeepSeek y cualquier API compatible (decisión 3: interfaz agnóstica)
export interface OpcionesOpenAICompatible {
  nombre: string;
  baseUrl: string;
  apiKey: string;
  modelo: string;
}

export class ProveedorOpenAICompatible implements ProveedorIA {
  constructor(private readonly opciones: OpcionesOpenAICompatible) {}

  async ejecutar(solicitud: SolicitudIA): Promise<RespuestaIA> {
    const respuesta = await fetch(`${this.opciones.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opciones.apiKey}`,
      },
      body: JSON.stringify({
        model: this.opciones.modelo,
        messages: solicitud.mensajes.map((m) => ({ role: m.rol, content: m.contenido })),
        max_tokens: solicitud.maxTokens ?? 2048,
      }),
      signal: AbortSignal.timeout(120000),
    });

    // 429 (rate limit) y 402 (payment) = cuota → failover (S5)
    if (respuesta.status === 429 || respuesta.status === 402) throw new QuotaError(this.opciones.nombre);
    if (!respuesta.ok) {
      throw new Error(`proveedor ${this.opciones.nombre}: HTTP ${respuesta.status} — ${await respuesta.text()}`);
    }

    const datos = (await respuesta.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      contenido: datos.choices?.[0]?.message?.content ?? '',
      uso: {
        entrada: datos.usage?.prompt_tokens ?? 0,
        salida: datos.usage?.completion_tokens ?? 0,
      },
      proveedor: this.opciones.nombre,
    };
  }
}
