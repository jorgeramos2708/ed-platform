// RED: App — sin sesión muestra acceso; con sesión muestra proyectos
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
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
});
