// RED: adaptadores reales — contrato HTTP con fetch mockeado (sin key; la key va por env)
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ProveedorOpenAICompatible } from './openai-compatible.proveedor';
import { ProveedorAnthropic } from './anthropic.proveedor';
import { QuotaError } from '../proveedor-ia';

afterEach(() => vi.unstubAllGlobals());

describe('ProveedorOpenAICompatible', () => {
  const proveedor = new ProveedorOpenAICompatible({
    nombre: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'key-prueba',
    modelo: 'gpt-4o-mini',
  });

  it('envía modelo, mensajes y Bearer; extrae contenido y uso de tokens', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'plan JSON' } }],
          usage: { prompt_tokens: 120, completion_tokens: 80 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchFalso);

    const r = await proveedor.ejecutar({ mensajes: [{ rol: 'user', contenido: 'hola' }], maxTokens: 512 });

    expect(r.contenido).toBe('plan JSON');
    expect(r.uso).toEqual({ entrada: 120, salida: 80 });
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key-prueba');
    const cuerpo = JSON.parse(init.body as string);
    expect(cuerpo.model).toBe('gpt-4o-mini');
    expect(cuerpo.max_tokens).toBe(512);
  });

  it('HTTP 429/402 se tipifica como QuotaError (failover)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })));
    await expect(proveedor.ejecutar({ mensajes: [] })).rejects.toBeInstanceOf(QuotaError);
  });

  it('otros errores HTTP son errores normales (no failover)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad request', { status: 400 })));
    await expect(proveedor.ejecutar({ mensajes: [] })).rejects.not.toBeInstanceOf(QuotaError);
  });
});

describe('ProveedorAnthropic', () => {
  const proveedor = new ProveedorAnthropic({
    nombre: 'anthropic',
    apiKey: 'key-prueba',
    modelo: 'claude-sonnet-4-5',
  });

  it('usa x-api-key + versión, separa el system y extrae content[0].text', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'plan JSON' }],
          usage: { input_tokens: 90, output_tokens: 60 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchFalso);

    const r = await proveedor.ejecutar({
      mensajes: [
        { rol: 'system', contenido: 'reglas' },
        { rol: 'user', contenido: 'hola' },
      ],
    });

    expect(r.contenido).toBe('plan JSON');
    expect(r.uso).toEqual({ entrada: 90, salida: 60 });
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const cabeceras = init.headers as Record<string, string>;
    expect(cabeceras['x-api-key']).toBe('key-prueba');
    expect(cabeceras['anthropic-version']).toBeDefined();
    const cuerpo = JSON.parse(init.body as string);
    expect(cuerpo.system).toBe('reglas'); // el rol system viaja como campo, no como mensaje
    expect(cuerpo.messages).toEqual([{ rol: undefined, content: 'hola' }].map((m) => ({ role: 'user', content: m.content })));
  });

  it('HTTP 429/529 se tipifican como QuotaError (failover)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('overloaded', { status: 529 })));
    await expect(proveedor.ejecutar({ mensajes: [] })).rejects.toBeInstanceOf(QuotaError);
  });
});
