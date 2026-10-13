// GREEN: implementación mínima para hacer pasar el test de salud
export class HealthService {
  check() {
    return { status: 'ok' as const, version: '0.1.0', servicio: 'ed-platform' };
  }
}
