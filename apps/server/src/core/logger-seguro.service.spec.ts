// RED: logger estructurado con redacción garantizada (CONSTRAINTS §1.2, puerta M1)
import { describe, it, expect, beforeEach } from 'vitest';
import { SanitizadorService } from '../secretos/sanitizador.service';
import { LoggerSeguro } from './logger-seguro.service';

describe('LoggerSeguro', () => {
  let sanitizador: SanitizadorService;
  let lineas: string[];
  let logger: LoggerSeguro;

  beforeEach(() => {
    sanitizador = new SanitizadorService();
    lineas = [];
    logger = new LoggerSeguro(sanitizador).conSalida((linea) => lineas.push(linea));
  });

  it('emite JSON estructurado parseable con nivel, contexto y mensaje', () => {
    logger.log('mensaje normal', 'AppModule');
    expect(lineas).toHaveLength(1);
    const parseada = JSON.parse(lineas[0]);
    expect(parseada.nivel).toBe('log');
    expect(parseada.contexto).toBe('AppModule');
    expect(parseada.mensaje).toBe('mensaje normal');
    expect(parseada.ts).toBeDefined();
  });

  it('REDACTA valores prohibidos en el mensaje y en los datos (nunca aparecen en el log)', () => {
    sanitizador.registrarValor('sk-abc-123');
    logger.log('token filtrado: sk-abc-123', 'Prueba', { cuerpo: { clave: 'sk-abc-123' } });
    const linea = lineas[0];
    expect(linea).not.toContain('sk-abc-123');
    expect(linea).toContain('[REDACTADO]');
    const parseada = JSON.parse(linea); // sigue siendo JSON válido tras redactar
    expect(parseada.datos.cuerpo.clave).toBe('[REDACTADO]');
  });

  it('error incluye la traza también redactada', () => {
    sanitizador.registrarValor('pass-secreta-9');
    logger.error('falló la operación', 'traza con pass-secreta-9 dentro', 'Ctx');
    const parseada = JSON.parse(lineas[0]);
    expect(parseada.nivel).toBe('error');
    expect(parseada.datos.traza).toContain('[REDACTADO]');
    expect(parseada.datos.traza).not.toContain('pass-secreta-9');
  });
});
