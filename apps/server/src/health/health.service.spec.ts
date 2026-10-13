// RED: este test falla porque HealthService todavía no existe (ciclo TDD, slice de salud)
import { describe, it, expect } from 'vitest';
import { HealthService } from './health.service';

describe('HealthService.check', () => {
  it('reporta estado ok con versión y servicio', () => {
    const servicio = new HealthService();
    const resultado = servicio.check();
    expect(resultado.status).toBe('ok');
    expect(resultado.version).toBe('0.1.0');
    expect(resultado.servicio).toBe('ed-platform');
  });
});
