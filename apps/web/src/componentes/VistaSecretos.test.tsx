// RED: VistaSecretos (F3-7) — registro de secretos en el vault desde la UI (el PAT nunca pasa por el chat)
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VistaSecretos } from './VistaSecretos';

function respuestaJson(datos: unknown, status = 200) {
  return new Response(JSON.stringify(datos), { status });
}

const mockFetchPorUrl = (rutas: Record<string, unknown>) =>
  vi.fn().mockImplementation((url: string) => {
    const clave = Object.keys(rutas).find((k) => url.includes(k));
    if (clave) return Promise.resolve(respuestaJson(rutas[clave]));
    return Promise.resolve(respuestaJson([]));
  });

afterEach(() => vi.unstubAllGlobals());

describe('VistaSecretos', () => {
  it('registra un secreto (nombre + valor) y lista solo los nombres', async () => {
    const llamadas: { url: string; metodo?: string; cuerpo?: unknown }[] = [];
    const fetchFalso = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      llamadas.push({ url, metodo: init?.method, cuerpo: init?.body ? JSON.parse(init.body as string) : undefined });
      if (url.includes('/secretos') && init?.method === 'POST') {
        return Promise.resolve(respuestaJson({ id: 's1', nombre: 'github-token' }, 201));
      }
      const creado = llamadas.some((l) => l.metodo === 'POST');
      return Promise.resolve(
        respuestaJson(creado ? [{ id: 's1', nombre: 'github-token' }] : [], 200),
      );
    });
    vi.stubGlobal('fetch', fetchFalso);
    render(<VistaSecretos token="tok" />);
    const nombre = await screen.findByLabelText(/nombre del secreto/i);
    await userEvent.type(nombre, 'github-token');
    await userEvent.type(screen.getByLabelText(/valor/i), 'ghp_valor-supersecreto');
    await userEvent.click(screen.getByRole('button', { name: /guardar secreto/i }));
    // el nombre aparece en la LISTA (dentro de <code>), y el valor JAMÁS
    await screen.findByText('github-token', { selector: 'code' });
    expect(screen.queryByText(/ghp_valor-supersecreto/)).not.toBeInTheDocument();
    const post = llamadas.find((l) => l.metodo === 'POST');
    expect(post?.cuerpo).toMatchObject({ nombre: 'github-token', valor: 'ghp_valor-supersecreto' });
  });

  it('estado vacío: sin secretos muestra mensaje, no una lista vacía', async () => {
    vi.stubGlobal('fetch', mockFetchPorUrl({ '/secretos': [] }));
    render(<VistaSecretos token="tok" />);
    await waitFor(() => expect(screen.getByText(/sin secretos guardados/i)).toBeInTheDocument());
  });
});
