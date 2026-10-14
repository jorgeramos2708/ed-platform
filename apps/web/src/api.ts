// Cliente API mínimo: token en localStorage, rutas same-origin (proxy/nginx), errores legibles
const CLAVE_TOKEN = 'edp-token';

export function obtenerToken(): string | null {
  return localStorage.getItem(CLAVE_TOKEN);
}

export function guardarToken(token: string): void {
  localStorage.setItem(CLAVE_TOKEN, token);
}

export function cerrarSesion(): void {
  localStorage.removeItem(CLAVE_TOKEN);
}

export async function api<T>(
  ruta: string,
  opciones?: { metodo?: string; cuerpo?: unknown; token?: string | null },
): Promise<T> {
  const token = opciones?.token ?? obtenerToken();
  const respuesta = await fetch(`/api${ruta}`, {
    method: opciones?.metodo ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opciones?.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw new Error((cuerpo as { message?: string }).message ?? `Error ${respuesta.status}`);
  }
  return cuerpo as T;
}
