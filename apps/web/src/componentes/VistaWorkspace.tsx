import { useEffect, useState } from 'react';
import { api } from '../api';

interface PasoPlan {
  accion: 'editar' | 'comando';
  archivo?: string;
  contenido?: string;
  comando?: string;
}

interface PlanGenerado {
  plan: { titulo: string; pasos: PasoPlan[] };
  proveedor: string;
  failover: boolean;
}

interface Mensaje {
  autor: 'usuario' | 'ia' | 'sistema';
  texto: string;
}

interface Props {
  proyectoId: string;
  nombreProyecto: string;
  token: string;
  alSalir: () => void;
}

// El flujo de M2: chat con la IA → plan mostrado ANTES de ejecutar → diff → aceptar o descartar (rewind)
export function VistaWorkspace({ proyectoId, nombreProyecto, token, alSalir }: Props) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [mensajeNuevo, setMensajeNuevo] = useState('');
  const [instruccion, setInstruccion] = useState('');
  const [plan, setPlan] = useState<PlanGenerado | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [checkpointInicial, setCheckpointInicial] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const ws = await api<{ id: string }>(`/proyectos/${proyectoId}/workspaces`, {
          metodo: 'POST',
          token,
        });
        if (!cancelado) setWorkspaceId(ws.id);
      } catch (e) {
        if (!cancelado) setError((e as Error).message);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [proyectoId, token]);

  async function enviarChat(e: React.FormEvent) {
    e.preventDefault();
    if (!mensajeNuevo.trim() || !workspaceId) return;
    const texto = mensajeNuevo;
    setMensajes((m) => [...m, { autor: 'usuario', texto }]);
    setMensajeNuevo('');
    try {
      const r = await api<{ respuesta: string }>(`/proyectos/${proyectoId}/harness/chat`, {
        metodo: 'POST',
        token,
        cuerpo: { mensajes: [{ rol: 'user', contenido: texto }] },
      });
      setMensajes((m) => [...m, { autor: 'ia', texto: r.respuesta }]);
    } catch (e) {
      setMensajes((m) => [...m, { autor: 'sistema', texto: (e as Error).message }]);
    }
  }

  async function pedirPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!instruccion.trim() || !workspaceId) return;
    setError('');
    try {
      const generado = await api<PlanGenerado>(`/proyectos/${proyectoId}/harness/plan`, {
        metodo: 'POST',
        token,
        cuerpo: { workspaceId, instruccion },
      });
      setPlan(generado);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function aprobar() {
    if (!plan || !workspaceId) return;
    setError('');
    try {
      const r = await api<{ checkpointInicial: string; diff: string }>(
        `/proyectos/${proyectoId}/harness/ejecutar`,
        { metodo: 'POST', token, cuerpo: { workspaceId, plan: plan.plan } },
      );
      setDiff(r.diff);
      setCheckpointInicial(r.checkpointInicial);
      setPlan(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function descartarTarea() {
    if (!checkpointInicial || !workspaceId) return;
    setError('');
    try {
      await api(`/proyectos/${proyectoId}/harness/descartar`, {
        metodo: 'POST',
        token,
        cuerpo: { workspaceId, checkpointInicial },
      });
      setDiff(null);
      setCheckpointInicial(null);
      setMensajes((m) => [...m, { autor: 'sistema', texto: 'Tarea descartada — el workspace volvió al estado inicial.' }]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="panel" data-testid="panel-workspace">
      <div className="cabecera">
        <h1>{nombreProyecto}</h1>
        <button onClick={alSalir}>Volver a proyectos</button>
      </div>

      {cargando && (
        <p role="status" aria-busy="true">
          Preparando el workspace aislado…
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {workspaceId && (
        <>
          <section>
            <h2>Chat</h2>
            {mensajes.length === 0 ? (
              <p className="vacio" role="status">
                Sin mensajes todavía — pregunta lo que quieras sobre el proyecto.
              </p>
            ) : (
              <ul role="log" aria-label="Historial del chat">
                {mensajes.map((m, i) => (
                  <li key={i} className={`mensaje-${m.autor}`}>
                    <strong>{m.autor === 'usuario' ? 'Tú' : m.autor === 'ia' ? 'IA' : 'Sistema'}:</strong> {m.texto}
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={enviarChat} className="fila">
              <label htmlFor="mensaje-chat" className="sr-solo">
                Mensaje
              </label>
              <input
                id="mensaje-chat"
                aria-label="Mensaje"
                value={mensajeNuevo}
                onChange={(e) => setMensajeNuevo(e.target.value)}
                placeholder="Escribe un mensaje…"
              />
              <button type="submit">Enviar</button>
            </form>
          </section>

          <section>
            <h2>Instrucción para la IA</h2>
            <form onSubmit={pedirPlan} className="fila">
              <label htmlFor="instruccion-ia" className="sr-solo">
                Instrucción para la IA
              </label>
              <input
                id="instruccion-ia"
                aria-label="Escribe la instrucción"
                value={instruccion}
                onChange={(e) => setInstruccion(e.target.value)}
                placeholder="Describe el cambio que quieres (la IA propondrá un plan)"
              />
              <button type="submit">Pedir plan</button>
            </form>
          </section>

          {plan && (
            <section data-testid="panel-plan">
              <h3>
                Plan: {plan.plan.titulo}{' '}
                <span className="slug">
                  (propuesto por {plan.proveedor}
                  {plan.failover ? ', tras failover' : ''})
                </span>
              </h3>
              <ol>
                {plan.plan.pasos.map((paso, i) => (
                  <li key={i}>
                    {paso.accion === 'editar' ? (
                      <>
                        Editar <code>{paso.archivo}</code>
                      </>
                    ) : (
                      <>
                        Ejecutar <code>{paso.comando}</code>
                      </>
                    )}
                  </li>
                ))}
              </ol>
              <button onClick={aprobar}>Aprobar y ejecutar</button>
              <button className="secundario" onClick={() => setPlan(null)}>
                Descartar plan
              </button>
            </section>
          )}

          {diff !== null && (
            <section data-testid="panel-diff">
              <h3>Cambios propuestos</h3>
              <pre>
                <code>{diff || '(sin cambios textuales)'}</code>
              </pre>
              <button onClick={() => setDiff(null)}>Aceptar</button>
              <button className="secundario" onClick={descartarTarea}>
                Descartar (rewind)
              </button>
            </section>
          )}
        </>
      )}
    </main>
  );
}
