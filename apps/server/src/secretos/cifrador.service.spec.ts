// RED: cifrador envelope (S6) — unidad pura de criptografía
import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { CifradorService } from './cifrador.service';

describe('CifradorService (AES-256-GCM, envelope)', () => {
  const clave = new CifradorService(randomBytes(32));

  it('cifra y descifra con la misma clave (round-trip exacto)', () => {
    const paquete = clave.cifrarCon(clave.clave, 'valor-claro-sk-123');
    expect(paquete.ct.toString('hex')).not.toContain('valor-claro');
    const plano = clave.descifrarCon(clave.clave, paquete).toString('utf8');
    expect(plano).toBe('valor-claro-sk-123');
  });

  it('descifrar con la clave equivocada falla (tag GCM inválido)', () => {
    const paquete = clave.cifrarCon(clave.clave, 'dato');
    const otra = new CifradorService(randomBytes(32));
    expect(() => otra.descifrarCon(otra.clave, paquete)).toThrow();
  });

  it('rechaza claves de longitud inválida en construcción', () => {
    expect(() => new CifradorService(randomBytes(16))).toThrow(/32 bytes/);
  });

  it('genera DEKs de 32 bytes y las envuelve/desenvuelve con la maestra', () => {
    const dek = clave.generarDek();
    expect(dek.length).toBe(32);
    const envuelta = clave.cifrarCon(clave.clave, dek); // Buffer directo: la DEK es binaria
    const dekDesenvuelta = clave.descifrarCon(clave.clave, envuelta);
    expect(dekDesenvuelta).toEqual(dek);
  });
});
