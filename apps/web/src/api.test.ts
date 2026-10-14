// RED: cliente API — token, cabecera Bearer y errores legibles
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, guardarToken, obtenerToken, cerrarSesion } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  cerrarSesion();
});

describe('api()', () => {
  it('incluye Authorization Bearer cuando hay token guardado', async () => {
    guardarToken('tok-123');
    const fetchFalso = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchFalso);
    await api('/proyectos');
    const [, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
    expect(obtenerToken()).toBe('tok-123');
  });

  it('lanza error legible con el message del backend', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Credenciales inválidas' }), { status: 401 }),
    );
    vi.stubGlobal('fetch', fetchFalso);
    await expect(api('/auth/login', { metodo: 'POST', cuerpo: {} })).rejects.toThrow('Credenciales inválidas');
  });

  it('sin token no envía Authorization', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchFalso);
    await api('/proyectos');
    const [, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
