// Mock de proveedor de IA para tests: respuestas scripted (strings) o errores (QuotaError etc.)
// Registra las solicitudes recibidas para verificar el prompt (reglas, resúmenes…)
import { ProveedorIA, RespuestaIA, SolicitudIA } from '../proveedor-ia';

export class ProveedorMock implements ProveedorIA {
  private i = 0;
  public solicitudes: SolicitudIA[] = [];

  constructor(public nombre: string, private respuestas: (string | Error)[]) {}

  async ejecutar(solicitud: SolicitudIA): Promise<RespuestaIA> {
    this.solicitudes.push(solicitud);
    const respuesta = this.respuestas[this.i++] ?? 'sin respuesta scripted';
    if (respuesta instanceof Error) throw respuesta;
    return {
      contenido: respuesta,
      uso: { entrada: 100, salida: 50 },
      proveedor: this.nombre,
    };
  }
}
