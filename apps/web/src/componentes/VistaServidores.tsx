import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

interface ServidorConAcciones {
  id: string;
  nombre: string;
  host: string;
  puerto: number;
  acciones: string[];
}

interface EstadoServidor {
  vivo: boolean;
  latenciaMs: number | null;
  detalle: string;
}

// F4-6: catálogo personal de servidores + terminal + archivos (la puerta de la Fase 4 en la UI)
export function VistaServidores({ token, esAdmin }: { token: string; esAdmin: boolean }) {
  const [servidores, setServidores] = useState<ServidorConAcciones[]>([]);
  const [error, setError] = useState('');
  const [estado, setEstado] = useState<Record<string, EstadoServidor>>({});
  const [panelArchivos, setPanelArchivos] = useState<string | null>(null);
  const [rutaSubir, setRutaSubir] = useState('');
  const [contenido, setContenido] = useState('');
  const [rutaDescargar, setRutaDescargar] = useState('');
  const [mensajeArchivo, setMensajeArchivo] = useState('');
  const [descargado, setDescargado] = useState('');
  const [terminalDe, setTerminalDe] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: '', host: '', puerto: '22', usuarioSsh: 'root', credencialId: '' });
  const [credenciales, setCredenciales] = useState<{ id: string; nombre: string }[]>([]);
  const contenedorTerminal = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<Terminal | null>(null);

  async function cargar() {
    try {
      setServidores(await api<ServidorConAcciones[]>('/servidores/mis-servidores', { token }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void cargar();
    if (esAdmin) {
      void api<{ id: string; nombre: string }[]>('/secretos', { token })
        .then(setCredenciales)
        .catch(() => setCredenciales([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verEstado(servidorId: string) {
    try {
      const e = await api<EstadoServidor>(`/servidores/${servidorId}/estado`, { token });
      setEstado((prev) => ({ ...prev, [servidorId]: e }));
    } catch (e) {
      setEstado((prev) => ({ ...prev, [servidorId]: { vivo: false, latenciaMs: null, detalle: (e as Error).message } }));
    }
  }

  function abrirTerminal(servidorId: string) {
    setTerminalDe(servidorId);
  }

  // F4-3: la terminal real — WebSocket ↔ PTY (el backend valida permiso + JWT + audita)
  useEffect(() => {
    if (!terminalDe || !contenedorTerminal.current) return;
    const term = new Terminal({ convertEol: true });
    terminalRef.current = term;
    term.open(contenedorTerminal.current);
    term.writeln('Conectando al servidor…');
    const ws = new WebSocket(
      `${location.origin.replace(/^http/, 'ws')}/api/terminal?token=${token}&servidorId=${terminalDe}`,
    );
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ tipo: 'conectar', servidorId: terminalDe }));
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data as string);
      if (m.tipo === 'datos') term.write(m.contenido);
      if (m.tipo === 'error') term.writeln(`\r\n[error] ${m.mensaje}`);
      if (m.tipo === 'cerrado') term.writeln('\r\n[sesión cerrada]');
    };
    term.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ tipo: 'entrada', datos: d }));
    });
    return () => {
      ws.close();
      term.dispose();
      wsRef.current = null;
      terminalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalDe]);

  async function subirArchivo(servidorId: string) {
    setError('');
    setMensajeArchivo('');
    try {
      const contenidoBase64 = btoa(unescape(encodeURIComponent(contenido)));
      const r = await api<{ ok: boolean; rutaRemota: string; bytes: number }>(`/servidores/${servidorId}/archivos`, {
        metodo: 'POST',
        token,
        cuerpo: { rutaRemota: rutaSubir, contenidoBase64 },
      });
      setMensajeArchivo(`Subido: ${r.rutaRemota} (${r.bytes} bytes)`);
    } catch (e) {
      setMensajeArchivo(`Error al subir: ${(e as Error).message}`);
    }
  }

  async function descargarArchivo(servidorId: string) {
    setError('');
    setDescargado('');
    try {
      const r = await api<{ rutaRemota: string; contenidoBase64: string }>(
        `/servidores/${servidorId}/archivos?ruta=${encodeURIComponent(rutaDescargar)}`,
        { token },
      );
      setDescargado(decodeURIComponent(escape(atob(r.contenidoBase64))));
    } catch (e) {
      setDescargado(`Error: ${(e as Error).message}`);
    }
  }

  async function crearServidor(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/servidores', {
        metodo: 'POST',
        token,
        cuerpo: {
          nombre: nuevo.nombre,
          host: nuevo.host,
          puerto: Number(nuevo.puerto),
          usuarioSsh: nuevo.usuarioSsh,
          credencialId: nuevo.credencialId,
        },
      });
      setNuevo({ nombre: '', host: '', puerto: '22', usuarioSsh: 'root', credencialId: nuevo.credencialId });
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="panel panel--trabajo" data-testid="panel-servidores">
      <h1>Servidores</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <ul aria-label="Mis servidores">
        {servidores.map((s) => (
          <li key={s.id}>
            <strong>{s.nombre}</strong> <span className="slug">({s.host}:{s.puerto})</span>
            <div className="slug">acciones: {s.acciones.join(', ')}</div>
            <div className="fila">
              {s.acciones.includes('terminal') && (
                <button onClick={() => setTerminalDe(terminalDe === s.id ? null : s.id)}>
                  {terminalDe === s.id ? 'Cerrar terminal' : 'Terminal'}
                </button>
              )}
              {s.acciones.includes('ejecutar') && (
                <button className="secundario" onClick={() => void verEstado(s.id)}>
                  Estado
                </button>
              )}
              {s.acciones.includes('sftp') && (
                <button className="secundario" onClick={() => setPanelArchivos(panelArchivos === s.id ? null : s.id)}>
                  Archivos
                </button>
              )}
            </div>
            {estado[s.id] && (
              <p role="status" data-testid={`estado-${s.id}`}>
                {estado[s.id].vivo
                  ? `vivo · ${estado[s.id].latenciaMs} ms`
                  : `muerto: ${estado[s.id].detalle}`}
              </p>
            )}

            {terminalDe === s.id && (
              <div data-testid="terminal" aria-label="Terminal SSH">
                <div ref={contenedorTerminal} />
              </div>
            )}

            {panelArchivos === s.id && (
              <div data-testid={`archivos-${s.id}`}>
                <div className="fila">
                  <label htmlFor={`ruta-${s.id}`} className="sr-solo">
                    Ruta remota
                  </label>
                  <input
                    id={`ruta-${s.id}`}
                    aria-label="Ruta remota"
                    value={rutaSubir}
                    onChange={(e) => setRutaSubir(e.target.value)}
                    placeholder="/config/notas.txt"
                  />
                </div>
                <label htmlFor={`contenido-${s.id}`} className="sr-solo">
                  Contenido
                </label>
                <textarea
                  id={`contenido-${s.id}`}
                  aria-label="Contenido"
                  value={contenido}
                  onChange={(e) => setContenido(e.target.value)}
                  rows={4}
                  style={{ width: '100%' }}
                  placeholder="Contenido del archivo a subir"
                />
                <div className="fila">
                  <button onClick={() => void subirArchivo(s.id)}>Subir</button>
                </div>
                <div className="fila">
                  <label htmlFor={`descarga-${s.id}`} className="sr-solo">
                    Ruta a descargar
                  </label>
                  <input
                    id={`descarga-${s.id}`}
                    aria-label="Ruta a descargar"
                    value={rutaDescargar}
                    onChange={(e) => setRutaDescargar(e.target.value)}
                    placeholder="/config/archivo.txt"
                  />
                  <button className="secundario" onClick={() => void descargarArchivo(s.id)}>
                    Descargar
                  </button>
                </div>
                {mensajeArchivo && (
                  <p role="status">
                    {mensajeArchivo}
                  </p>
                )}
                {descargado && (
                  <pre data-testid="contenido-descargado">
                    <code>{descargado}</code>
                  </pre>
                )}
              </div>
            )}
          </li>
        ))}
        {servidores.length === 0 && (
          <li className="vacio">Sin servidores autorizados todavía — pide acceso a un administrador.</li>
        )}
      </ul>

      {esAdmin && (
        <section aria-label="Nuevo servidor">
          <h2>Nuevo servidor</h2>
          <form
            onSubmit={(e) => {
              void crearServidor(e);
            }}
          >
            <label htmlFor="srv-nombre">Nombre</label>
            <input id="srv-nombre" aria-label="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} required />
            <label htmlFor="srv-host">Host</label>
            <input id="srv-host" aria-label="Host" value={nuevo.host} onChange={(e) => setNuevo({ ...nuevo, host: e.target.value })} required />
            <label htmlFor="srv-puerto">Puerto</label>
            <input id="srv-puerto" aria-label="Puerto" value={nuevo.puerto} onChange={(e) => setNuevo({ ...nuevo, puerto: e.target.value })} />
            <label htmlFor="srv-usuario">Usuario SSH</label>
            <input id="srv-usuario" aria-label="Usuario SSH" value={nuevo.usuarioSsh} onChange={(e) => setNuevo({ ...nuevo, usuarioSsh: e.target.value })} />
            <label htmlFor="srv-credencial">Credencial (secreto del vault)</label>
            <select
              id="srv-credencial"
              aria-label="Credencial"
              value={nuevo.credencialId}
              onChange={(e) => setNuevo({ ...nuevo, credencialId: e.target.value })}
              required
            >
              <option value="">— elige —</option>
              {credenciales.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <button type="submit">Crear servidor</button>
          </form>
        </section>
      )}
    </main>
  );
}
