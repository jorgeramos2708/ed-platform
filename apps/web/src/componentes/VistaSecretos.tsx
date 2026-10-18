import { useEffect, useState } from 'react';
import { api } from '../api';

interface SecretoMeta {
  id: string;
  nombre: string;
}

// F3-7: gestión del vault desde la UI — los secretos (p. ej. el PAT de GitHub) los registra el
// usuario AQUÍ y nunca transitan por el chat ni por el repo. Solo se listan NOMBRES, jamás valores.
export function VistaSecretos({ token }: { token: string }) {
  const [secretos, setSecretos] = useState<SecretoMeta[]>([]);
  const [nombre, setNombre] = useState('');
  const [valor, setValor] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  async function cargar() {
    try {
      setSecretos(await api<SecretoMeta[]>('/secretos', { token }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !valor.trim()) return;
    setError('');
    setMensaje('');
    try {
      await api('/secretos', { metodo: 'POST', token, cuerpo: { nombre: nombre.trim(), valor } });
      setMensaje(`Secreto "${nombre.trim()}" guardado (cifrado; solo se guarda el nombre en claro).`);
      setNombre('');
      setValor('');
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section>
      <h2>Secretos</h2>
      <p className="lema">
        Valores cifrados para credenciales (p. ej. el PAT de GitHub como “github-token”). Se guardan
        cifrados y jamás se vuelven a mostrar.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form onSubmit={guardar} className="fila">
        <label htmlFor="secreto-nombre" className="sr-solo">
          Nombre del secreto
        </label>
        <input
          id="secreto-nombre"
          aria-label="Nombre del secreto"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="github-token"
        />
        <label htmlFor="secreto-valor" className="sr-solo">
          Valor
        </label>
        <input
          id="secreto-valor"
          aria-label="Valor"
          type="password"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Valor secreto (no se volverá a mostrar)"
        />
        <button type="submit">Guardar secreto</button>
      </form>
      {mensaje && (
        <p role="status">
          {mensaje}
        </p>
      )}
      {secretos.length > 0 ? (
        <ul aria-label="Secretos guardados">
          {secretos.map((s) => (
            <li key={s.id}>
              <code>{s.nombre}</code> — valor cifrado
            </li>
          ))}
        </ul>
      ) : (
        <p className="vacio" role="status">
          Sin secretos guardados todavía.
        </p>
      )}
    </section>
  );
}
