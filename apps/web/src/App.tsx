import { useEffect, useState } from 'react';
import { api, cerrarSesion, guardarToken, obtenerToken } from './api';
import { VistaWorkspace } from './componentes/VistaWorkspace';
import { VistaSecretos } from './componentes/VistaSecretos';
import { VistaServidores } from './componentes/VistaServidores';

interface Proyecto {
  id: string;
  nombre: string;
  slug: string;
  repoUrl?: string | null;
  ramaDefault?: string;
}

type Vista = 'proyectos' | 'servidores' | 'secretos';

function vistaDeHash(): Vista {
  const h = window.location.hash;
  if (h.includes('servidores')) return 'servidores';
  if (h.includes('secretos')) return 'secretos';
  return 'proyectos';
}

// F4-6b: app shell con navegación por hash — cada vista en su panel (sin acumulación en cascada)
export function App() {
  const [token, setToken] = useState<string | null>(obtenerToken());
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [proyectoAbierto, setProyectoAbierto] = useState<Proyecto | null>(null);
  const [vista, setVista] = useState<Vista>(vistaDeHash);
  const [error, setError] = useState('');
  const [modo, setModo] = useState<'login' | 'registro'>('login');
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [nombreProyecto, setNombreProyecto] = useState('');
  const [remotoDe, setRemotoDe] = useState<Proyecto | null>(null);
  const [urlRemoto, setUrlRemoto] = useState('');
  const [ramaRemota, setRamaRemota] = useState('main');

  useEffect(() => {
    const alCambiar = () => setVista(vistaDeHash());
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function navegar(v: Vista): void {
    window.location.hash = v === 'proyectos' ? '/proyectos' : `/${v}`;
    setVista(v);
  }

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

  async function guardarRemoto() {
    if (!remotoDe) return;
    setError('');
    try {
      const actualizado = await api<Proyecto>(`/proyectos/${remotoDe.id}`, {
        metodo: 'PATCH',
        token: token ?? '',
        cuerpo: { repoUrl: urlRemoto.trim() || null, ramaDefault: ramaRemota.trim() || 'main' },
      });
      setProyectos((ps) => ps.map((p) => (p.id === actualizado.id ? actualizado : p)));
      setRemotoDe(null);
      setUrlRemoto('');
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
    <main className="panel panel--trabajo">
      <h1>ED Platform</h1>
      <nav aria-label="Navegación principal" className="navegacion">
        <a
          href="#/proyectos"
          className={vista === 'proyectos' ? 'nav-activo' : 'nav-inactivo'}
          aria-current={vista === 'proyectos' ? 'page' : undefined}
          onClick={() => setVista('proyectos')}
        >
          Proyectos
        </a>
        <a
          href="#/servidores"
          className={vista === 'servidores' ? 'nav-activo' : 'nav-inactivo'}
          aria-current={vista === 'servidores' ? 'page' : undefined}
          onClick={() => setVista('servidores')}
        >
          Servidores
        </a>
        <a
          href="#/secretos"
          className={vista === 'secretos' ? 'nav-activo' : 'nav-inactivo'}
          aria-current={vista === 'secretos' ? 'page' : undefined}
          onClick={() => setVista('secretos')}
        >
          Secretos
        </a>
        <button onClick={salir}>Salir</button>
      </nav>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {vista === 'proyectos' && (
        <div data-testid="panel-proyectos">
          <div className="cabecera">
            <h2>Proyectos</h2>
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
                <strong>{p.nombre}</strong> <span className="slug">({p.slug})</span>
                {p.repoUrl && (
                  <span className="slug" aria-label={`Origen: ${p.repoUrl}`}>
                    {' '}
                    · {p.repoUrl}
                  </span>
                )}{' '}
                <span className="acciones-proyecto">
                  <button onClick={() => setProyectoAbierto(p)}>Abrir workspace</button>{' '}
                  <button className="secundario" onClick={() => setRemotoDe(p)}>
                    Remoto
                  </button>
                </span>
                {remotoDe?.id === p.id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void guardarRemoto();
                    }}
                    className="fila"
                    aria-label={`Remoto de ${p.nombre}`}
                  >
                    <label htmlFor={`remoto-${p.id}`} className="sr-solo">
                      URL del remoto
                    </label>
                    <input
                      id={`remoto-${p.id}`}
                      aria-label="URL del remoto"
                      value={urlRemoto}
                      onChange={(e) => setUrlRemoto(e.target.value)}
                      placeholder="https://github.com/org/repo.git"
                    />
                    <label htmlFor={`rama-${p.id}`} className="sr-solo">
                      Rama por defecto
                    </label>
                    <input
                      id={`rama-${p.id}`}
                      aria-label="Rama por defecto"
                      value={ramaRemota}
                      onChange={(e) => setRamaRemota(e.target.value)}
                      placeholder="main"
                      style={{ maxWidth: '9rem' }}
                    />
                    <button type="submit">Guardar remoto</button>
                    <button type="button" className="secundario" onClick={() => setRemotoDe(null)}>
                      Cancelar
                    </button>
                  </form>
                )}
              </li>
            ))}
            {proyectos.length === 0 && <li className="vacio">Sin proyectos todavía — crea el primero.</li>}
          </ul>
        </div>
      )}

      {vista === 'servidores' && <VistaServidores token={token} esAdmin={true} />}

      {vista === 'secretos' && (
        <div className="panel" data-testid="panel-secretos">
          <VistaSecretos token={token} />
        </div>
      )}
    </main>
  );
}
