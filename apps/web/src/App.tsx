import { useEffect, useState } from 'react';
import { api, cerrarSesion, guardarToken, obtenerToken } from './api';
import { VistaWorkspace } from './componentes/VistaWorkspace';

interface Proyecto {
  id: string;
  nombre: string;
  slug: string;
}

export function App() {
  const [token, setToken] = useState<string | null>(obtenerToken());
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [proyectoAbierto, setProyectoAbierto] = useState<Proyecto | null>(null);
  const [error, setError] = useState('');
  const [modo, setModo] = useState<'login' | 'registro'>('login');
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [nombreProyecto, setNombreProyecto] = useState('');

  async function cargarProyectos() {
    try {
      setProyectos(await api<Proyecto[]>('/proyectos'));
      setError('');
    } catch (e) {
      const mensaje = (e as Error).message;
      if (mensaje.includes('Token') || mensaje.includes('Unauthorized')) {
        cerrarSesion();
        setToken(null);
      }
      setError(mensaje);
    }
  }

  useEffect(() => {
    if (token) void cargarProyectos();
  }, [token]);

  async function enviarAcceso(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (modo === 'registro') {
        await api('/auth/registro', { metodo: 'POST', cuerpo: { email, nombre, password } });
      }
      const { token: nuevoToken } = await api<{ token: string }>('/auth/login', {
        metodo: 'POST',
        cuerpo: { email, password },
      });
      guardarToken(nuevoToken);
      setToken(nuevoToken);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function crearProyecto(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/proyectos', { metodo: 'POST', cuerpo: { nombre: nombreProyecto } });
      setNombreProyecto('');
      await cargarProyectos();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function salir() {
    cerrarSesion();
    setToken(null);
    setProyectos([]);
  }

  if (token && proyectoAbierto) {
    return (
      <VistaWorkspace
        proyectoId={proyectoAbierto.id}
        nombreProyecto={proyectoAbierto.nombre}
        token={token}
        alSalir={() => setProyectoAbierto(null)}
      />
    );
  }

  if (!token) {
    return (
      <main className="panel" data-testid="panel-acceso">
        <h1>ED Platform</h1>
        <p className="lema">Alinea, ejecuta, verifica, cierra.</p>
        <div role="tablist" aria-label="Modo de acceso">
          <button role="tab" aria-selected={modo === 'login'} onClick={() => setModo('login')}>
            Acceder
          </button>
          <button role="tab" aria-selected={modo === 'registro'} onClick={() => setModo('registro')}>
            Crear cuenta
          </button>
        </div>
        <form onSubmit={enviarAcceso}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {modo === 'registro' && (
            <>
              <label htmlFor="nombre">Nombre</label>
              <input id="nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </>
          )}
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit">{modo === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="panel" data-testid="panel-proyectos">
      <h1>ED Platform</h1>
      <div className="cabecera">
        <h2>Proyectos</h2>
        <button onClick={salir}>Salir</button>
      </div>
      <form onSubmit={crearProyecto} className="fila">
        <label htmlFor="nombre-proyecto">Nuevo proyecto</label>
        <input
          id="nombre-proyecto"
          required
          value={nombreProyecto}
          onChange={(e) => setNombreProyecto(e.target.value)}
          placeholder="Nombre del proyecto"
        />
        <button type="submit">Crear</button>
      </form>
      <ul data-testid="lista-proyectos">
        {proyectos.map((p) => (
          <li key={p.id}>
            {p.nombre} <span className="slug">({p.slug})</span>{' '}
            <button onClick={() => setProyectoAbierto(p)}>Abrir workspace</button>
          </li>
        ))}
        {proyectos.length === 0 && <li className="vacio">Sin proyectos todavía — crea el primero.</li>}
      </ul>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </main>
  );
}
