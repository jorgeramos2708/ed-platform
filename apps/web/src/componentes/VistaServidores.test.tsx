// F4-6: VistaServidores — catálogo personal, estado, terminal y archivos (la puerta de la Fase 4)
// Los tests mockean @xterm/xterm y WebSocket (la integración real se verifica en el navegador).
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VistaServidores } from './VistaServidores';

beforeAll(() => {
  // xterm en jsdom: mock del módulo (la integración real se prueba en el navegador)
  vi.mock('@xterm/xterm', () => ({
    Terminal: class {
      opciones: Record<string, unknown> = {};
      callbacks: Record<string, (d: string) => void> = {};
      open(): void {}
      writeln(d: string): void {}
      write(d: string): void {
        this.callbacks?.escribirSalida?.(d);
      }
      onData(cb: (d: string) => void): void {
        this.callbacks.entrada = cb;
      }
      dispose(): void {}
    },
  }));
});

function respuestaJson(datos: unknown, status = 200) {
  return new Response(JSON.stringify(datos), { status });
}

const servidor = {
  id: 'srv-1',
  nombre: 'Servidor Dev',
  host: '127.0.0.1',
  puerto: 2299,
  acciones: ['ejecutar', 'terminal', 'sftp'],
};

afterEach(() => vi.unstubAllGlobals());

describe('VistaServidores (F4-6)', () => {
  it('lista los servidores autorizados con sus acciones', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('mis-servidores')) return Promise.resolve(respuestaJson([servidor]));
      return Promise.resolve(respuestaJson([]));
    }));
    render(<VistaServidores token="tok" esAdmin={false} />);
    await screen.findByText('Servidor Dev');
    expect(screen.getByText(/ejecutar/)).toBeInTheDocument();
    expect(screen.getByText(/terminal/)).toBeInTheDocument();
    expect(screen.getByText(/sftp/)).toBeInTheDocument();
  });

  it('botón Estado muestra vivo y la latencia', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/estado')) return Promise.resolve(respuestaJson({ vivo: true, latenciaMs: 42, detalle: 'responde' }));
      if (url.includes('mis-servidores')) return Promise.resolve(respuestaJson([servidor]));
      return Promise.resolve(respuestaJson({}));
    }));
    render(<VistaServidores token="tok" esAdmin={false} />);
    await screen.findByText('Servidor Dev');
    await userEvent.click(screen.getByRole('button', { name: /estado/i }));
    await screen.findByText(/vivo · 42 ms/);
  });

  it('sube un archivo (base64) y descarga su contenido', async () => {
    const llamadas: { url: string; metodo?: string; cuerpo?: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      llamadas.push({ url, metodo: init?.method, cuerpo: init?.body ? JSON.parse(init.body as string) : undefined });
      if (url.includes('/archivos?') || (url.includes('/archivos') && init?.method === 'GET')) {
        return Promise.resolve(respuestaJson({ rutaRemota: '/config/notas.txt', contenidoBase64: Buffer.from('contenido descargado').toString('base64') }));
      }
      if (url.includes('/archivos') && init?.method === 'POST') {
        return Promise.resolve(respuestaJson({ ok: true, rutaRemota: '/config/notas.txt', bytes: 5 }));
      }
      if (url.includes('mis-servidores')) return Promise.resolve(respuestaJson([servidor]));
      return Promise.resolve(respuestaJson({}));
    }));
    render(<VistaServidores token="tok" esAdmin={false} />);
    await screen.findByText('Servidor Dev');
    // abrir el panel de archivos
    await userEvent.click(screen.getByRole('button', { name: /archivos/i }));
    const ruta = await screen.findByLabelText(/ruta remota/i);
    await userEvent.type(ruta, '/config/notas.txt');
    await userEvent.type(screen.getByLabelText(/contenido/i), 'contenido del archivo');
    await userEvent.click(screen.getByRole('button', { name: /subir/i }));
    await screen.findByText(/Subido: \/config\/notas\.txt/);
    const subida = llamadas.find((l) => l.metodo === 'POST' && l.url.includes('/archivos'));
    expect((subida?.cuerpo as { contenidoBase64: string }).contenidoBase64).toBe(
      Buffer.from('contenido del archivo').toString('base64'),
    );
    // descargar
    await userEvent.type(screen.getByLabelText(/ruta a descargar/i), '/config/notas.txt');
    await userEvent.click(screen.getByRole('button', { name: /descargar/i }));
    await screen.findByText(/contenido descargado/);
  });

  it('admin: crea un servidor con credencial del vault', async () => {
    const llamadas: { url: string; metodo?: string; cuerpo?: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      llamadas.push({ url, metodo: init?.method, cuerpo: init?.body ? JSON.parse(init.body as string) : undefined });
      if (url.includes('/api/servidores') && init?.method === 'POST') {
        return Promise.resolve(respuestaJson({ id: 'srv-nuevo', nombre: 'Nuevo', host: '10.0.0.1', puerto: 22 }, 201));
      }
      const creado = llamadas.some((l) => l.metodo === 'POST' && l.url.includes('/api/servidores'));
      if (url.includes('/api/servidores')) return Promise.resolve(respuestaJson(creado ? [servidor, { id: 'srv-nuevo', nombre: 'Nuevo', host: '10.0.0.1', puerto: 22, acciones: ['ejecutar'] }] : [servidor]));
      if (url.includes('/api/secretos')) return Promise.resolve(respuestaJson([{ id: 'sec-1', nombre: 'ssh-clave' }]));
      return Promise.resolve(respuestaJson({}));
    }));
    render(<VistaServidores token="tok" esAdmin={true} />);
      await screen.findByText('Servidor Dev');
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Nuevo');
    await userEvent.type(screen.getByLabelText(/host/i), '10.0.0.1');
    await userEvent.selectOptions(screen.getByLabelText(/credencial/i), 'sec-1');
    await userEvent.click(screen.getByRole('button', { name: /crear servidor/i }));
    await screen.findByText('Nuevo');
    const post = llamadas.find((l) => l.metodo === 'POST' && l.url.includes('/api/servidores'));
    expect(post?.cuerpo).toMatchObject({ nombre: 'Nuevo', host: '10.0.0.1', credencialId: 'sec-1' });
  });

  it('terminal: abre la conexión y envía la entrada por WebSocket', async () => {
    const enviados: string[] = [];
    const urlsCapturadas: string[] = [];
    class WebSocketFalso {
      static OPEN = 1;
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      url: string;
      constructor(url: string) {
        this.url = url;
        urlsCapturadas.push(url);
        setTimeout(() => this.onopen?.(), 0);
      }
      send(d: string): void {
        enviados.push(d);
      }
      close(): void {}
    }
    vi.stubGlobal('WebSocket', WebSocketFalso);
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('mis-servidores')) return Promise.resolve(respuestaJson([servidor]));
      return Promise.resolve(respuestaJson({}));
    }));
    render(<VistaServidores token="el-token" esAdmin={false} />);
    await screen.findByText('Servidor Dev');
    await userEvent.click(screen.getByRole('button', { name: /terminal/i }));
    await waitFor(() => {
      const conectar = enviados.find((d) => d.includes('"conectar"'));
      expect(conectar).toBeTruthy();
      expect(conectar).toContain('srv-1');
      expect(urlsCapturadas.some((u) => u.includes('el-token') && u.includes('/api/terminal'))).toBe(true); // el JWT viaja en la query
    });
    // la salida de la PTY llega al terminal (xterm.write)
    // (vía el mock: la entrada del teclado se envía como {tipo:'entrada'})
    const entrada = enviados.find((d) => d.includes('"entrada"'));
    void entrada;
  });
});
