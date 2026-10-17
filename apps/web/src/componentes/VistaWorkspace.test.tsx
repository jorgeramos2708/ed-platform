// RED: VistaWorkspace — chat, plan, diff y aceptar/descartar (el flujo de M2)
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VistaWorkspace } from './VistaWorkspace';

function respuestaJson(datos: unknown, status = 200) {
  return new Response(JSON.stringify(datos), { status });
}

const mockFetchPorUrl = (rutas: Record<string, unknown>) =>
  vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    // orden de inserción: las claves específicas (push/pull/historial) deben ir ANTES que '/workspaces'
    const clave = Object.keys(rutas).find((k) => url.includes(k));
    if (clave) return Promise.resolve(respuestaJson(rutas[clave]));
    return Promise.resolve(respuestaJson({}));
  });

afterEach(() => vi.unstubAllGlobals());

describe('VistaWorkspace', () => {
  it('crea el workspace al abrirse y muestra el panel de chat', async () => {
    const fetchFalso = mockFetchPorUrl({ '/workspaces': { id: 'ws-1' } });
    vi.stubGlobal('fetch', fetchFalso);
    render(<VistaWorkspace proyectoId="p1" nombreProyecto="Mi Proyecto" token="tok" alSalir={() => {}} />);
    await screen.findByTestId('panel-workspace');
    await waitFor(() => expect(fetchFalso).toHaveBeenCalledWith(expect.stringContaining('/workspaces'), expect.objectContaining({ method: 'POST' })));
    expect(screen.getByLabelText(/mensaje/i)).toBeInTheDocument();
  });

  it('envía el chat y muestra la respuesta de la IA', async () => {
    const fetchFalso = mockFetchPorUrl({
      '/workspaces': { id: 'ws-1' },
      '/harness/chat': { respuesta: 'El proyecto está bien', proveedor: 'mock' },
    });
    vi.stubGlobal('fetch', fetchFalso);
    render(<VistaWorkspace proyectoId="p1" nombreProyecto="Mi Proyecto" token="tok" alSalir={() => {}} />);
    const entrada = await screen.findByLabelText(/mensaje/i);
    await userEvent.type(entrada, '¿cómo está?{enter}');
    await screen.findByText('El proyecto está bien');
  });

  it('pide un plan a la IA, lo muestra y lo ejecuta al aprobar', async () => {
    const fetchFalso = mockFetchPorUrl({
      '/workspaces': { id: 'ws-1' },
      '/harness/plan': {
        plan: { titulo: 'saludar', pasos: [{ accion: 'editar', archivo: 'app.txt', contenido: 'hola IA' }] },
        proveedor: 'mock',
        failover: false,
        uso: { entrada: 10, salida: 10 },
      },
      '/harness/ejecutar': {
        checkpointInicial: 'abc123',
        checkpointFinal: 'def456',
        diff: 'diff --git a/app.txt\n+hola IA',
        pasos: 1,
      },
    });
    vi.stubGlobal('fetch', fetchFalso);
    render(<VistaWorkspace proyectoId="p1" nombreProyecto="Mi Proyecto" token="tok" alSalir={() => {}} />);
    const instruccion = await screen.findByLabelText(/instrucción para la IA/i);
    await userEvent.type(instruccion, 'agrega un saludo{enter}');
    await screen.findByText(/plan: saludar/i);
    await userEvent.click(screen.getByRole('button', { name: /aprobar y ejecutar/i }));
    await screen.findByTestId('panel-diff');
    expect(screen.getByTestId('panel-diff')).toHaveTextContent('+hola IA');
  });

  it('descartar (rewind) avisa que la tarea se revirtió', async () => {
    const fetchFalso = mockFetchPorUrl({
      '/workspaces': { id: 'ws-1' },
      '/harness/plan': {
        plan: { titulo: 't', pasos: [{ accion: 'comando', comando: 'echo x' }] },
        proveedor: 'mock',
        uso: { entrada: 1, salida: 1 },
      },
      '/harness/ejecutar': { checkpointInicial: 'abc', checkpointFinal: 'def', diff: '+x', pasos: 1 },
      '/harness/descartar': { head: 'abc', limpio: true },
    });
    vi.stubGlobal('fetch', fetchFalso);
    render(<VistaWorkspace proyectoId="p1" nombreProyecto="Mi Proyecto" token="tok" alSalir={() => {}} />);
    const instruccion = await screen.findByLabelText(/escribe la instrucción/i);
    await userEvent.type(instruccion, 'haz algo{enter}');
    await screen.findByTestId('panel-plan');
    await userEvent.click(screen.getByRole('button', { name: /aprobar y ejecutar/i }));
    await screen.findByTestId('panel-diff');
    await userEvent.click(screen.getByRole('button', { name: 'Descartar (rewind)' }));
    await screen.findByText(/tarea descartada/i);
  });

  describe('panel de git (Fase 3: workspace clonado de un remoto)', () => {
    it('muestra historial y permite publicar cambios (push)', async () => {
      const fetchFalso = mockFetchPorUrl({
        '/historial': [{ hash: 'aaa111', asunto: 'commit de la IA' }],
        '/push': { rechazado: false },
        '/workspaces': { id: 'ws-1', clonado: true },
      });
      vi.stubGlobal('fetch', fetchFalso);
      render(<VistaWorkspace proyectoId="p1" nombreProyecto="Mi Proyecto" token="tok" alSalir={() => {}} />);
      await screen.findByTestId('panel-git');
      await screen.findByText(/commit de la IA/);
      await userEvent.click(screen.getByRole('button', { name: /publicar cambios/i }));
      await screen.findByText(/cambios publicados en el origen/i);
    });

    it('push rechazado sugiere traer cambios; pull con conflicto muestra los archivos', async () => {
      const fetchFalso = mockFetchPorUrl({
        '/historial': [{ hash: 'aaa111', asunto: 'base' }],
        '/push': { rechazado: true },
        '/pull': { conflicto: true, archivosConflicto: ['compartido.txt'] },
        '/workspaces': { id: 'ws-1', clonado: true },
      });
      vi.stubGlobal('fetch', fetchFalso);
      render(<VistaWorkspace proyectoId="p1" nombreProyecto="Mi Proyecto" token="tok" alSalir={() => {}} />);
      await screen.findByTestId('panel-git');
      await userEvent.click(screen.getByRole('button', { name: /publicar cambios/i }));
      await screen.findByText(/el origen avanzó.*trae los cambios/i);
      await userEvent.click(screen.getByRole('button', { name: /traer cambios/i }));
      await screen.findByText(/conflicto en: compartido\.txt/i);
    });
  });
});
