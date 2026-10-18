// RED: App — sin sesión muestra acceso; con sesión muestra proyectos
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('sin sesión muestra el formulario de acceso', () => {
    render(<App />);
    expect(screen.getByTestId('panel-acceso')).toBeInTheDocument();
  });

  it('con sesión carga y muestra los proyectos', async () => {
    localStorage.setItem('edp-token', 'tok-valido');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          new Response(JSON.stringify(url.includes('/proyectos') ? [{ id: '1', nombre: 'Proyecto Visible' }] : {}), {
            status: 200,
          }),
        ),
      ),
    );
    render(<App />);
    expect(await screen.findByText('Proyecto Visible')).toBeInTheDocument();
    expect(screen.getByTestId('panel-proyectos')).toBeInTheDocument();
  });

  describe('configuración del remoto (Fase 3)', () => {
    it('abre el formulario, envía PATCH con repo_url y refresca la lista mostrando el origen', async () => {
      localStorage.setItem('edp-token', 'tok-valido');
      const llamadas: { url: string; metodo?: string; cuerpo?: unknown }[] = [];
      const fetchFalso = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        llamadas.push({ url, metodo: init?.method, cuerpo: init?.body ? JSON.parse(init.body as string) : undefined });
        if (url.includes('/proyectos') && init?.method === 'PATCH') {
          return Promise.resolve(
            new Response(JSON.stringify({ id: '1', nombre: 'Proyecto Visible', repoUrl: 'https://github.com/org/repo.git', ramaDefault: 'main' }), { status: 200 }),
          );
        }
        const yaConfigurado = llamadas.some((l) => l.metodo === 'PATCH');
        return Promise.resolve(
          new Response(
            JSON.stringify(
              url.includes('/proyectos')
                ? yaConfigurado
                  ? [{ id: '1', nombre: 'Proyecto Visible', repoUrl: 'https://github.com/org/repo.git' }]
                  : [{ id: '1', nombre: 'Proyecto Visible' }]
                : {},
            ),
            { status: 200 },
          ),
        );
      });
      vi.stubGlobal('fetch', fetchFalso);
      render(<App />);
      await screen.findByText('Proyecto Visible');
      await userEvent.click(screen.getByRole('button', { name: /remoto/i }));
      const urlInput = await screen.findByLabelText(/url del remoto/i);
      await userEvent.type(urlInput, 'https://github.com/org/repo.git');
      await userEvent.click(screen.getByRole('button', { name: /guardar remoto/i }));
      await screen.findByText(/github\.com\/org\/repo\.git/);
      const patch = llamadas.find((l) => l.metodo === 'PATCH');
      expect(patch?.cuerpo).toMatchObject({ repoUrl: 'https://github.com/org/repo.git' });
    });
  });

  describe('navegación del shell (F4-6b)', () => {
    function mockShell(): void {
      window.location.hash = '#/proyectos'; // el hash persiste entre tests
      localStorage.setItem('edp-token', 'tok-valido');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) =>
          Promise.resolve(
            new Response(
              JSON.stringify(
                url.includes('/servidores')
                  ? [{ id: 's1', nombre: 'Servidor UI', acciones: ['ejecutar'] }]
                  : url.includes('/secretos')
                    ? []
                    : url.includes('/proyectos')
                      ? [{ id: '1', nombre: 'Proyecto Visible' }]
                      : {},
              ),
              { status: 200 },
            ),
          ),
        ),
      );
    }

    it('navega a Servidores y muestra su panel', async () => {
      mockShell();
      render(<App />);
      await screen.findByText('Proyecto Visible');
      await userEvent.click(screen.getByRole('link', { name: /^servidores$/i }));
      expect(await screen.findByTestId('panel-servidores')).toBeInTheDocument();
      expect(screen.queryByText('Proyecto Visible')).not.toBeInTheDocument();
    });

    it('navega a Secretos y muestra su panel', async () => {
      mockShell();
      render(<App />);
      await screen.findByText('Proyecto Visible');
      await userEvent.click(screen.getByRole('link', { name: /^secretos$/i }));
      expect(await screen.findByTestId('panel-secretos')).toBeInTheDocument();
      expect(screen.queryByText('Proyecto Visible')).not.toBeInTheDocument();
    });

    it('vuelve a Proyectos con el enlace de navegación', async () => {
      mockShell();
      render(<App />);
      await screen.findByText('Proyecto Visible');
      await userEvent.click(screen.getByRole('link', { name: /^secretos$/i }));
      await screen.findByTestId('panel-secretos');
      await userEvent.click(screen.getByRole('link', { name: /^proyectos$/i }));
      expect(await screen.findByTestId('panel-proyectos')).toBeInTheDocument();
    });
  });
});
