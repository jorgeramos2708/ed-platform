// Mock de proveedor de IA para tests: respuestas scripted (strings) o errores (QuotaError etc.)
import { ProveedorIA, RespuestaIA, SolicitudIA } from '../proveedor-ia';

export class ProveedorMock implements ProveedorIA {
  private i = 0;

  constructor(public nombre: string, private respuestas: (string | Error)[]) {}

  async ejecutar(_solicitud: SolicitudIA): Promise<RespuestaIA> {
    const respuesta = this.respuestas[this.i++] ?? 'sin respuesta scripted';
    if (respuesta instanceof Error) throw respuesta;
    return {
      contenido: respuesta,
      uso: { entrada: 100, salida: 50 },
      proveedor: this.nombre,
    };
  }
}
