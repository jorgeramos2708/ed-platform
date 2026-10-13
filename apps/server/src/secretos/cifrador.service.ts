import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface PaqueteCifrado {
  ct: Buffer;
  iv: Buffer;
  tag: Buffer;
}

// Cifrador envelope (spike S6/ADR-0005): AES-256-GCM, DEK por secreto envuelta con la maestra.
// El descifrado SIEMPRE devuelve Buffer — los valores binarios (DEKs) no son UTF-8 (lección S6).
export class CifradorService {
  constructor(public readonly clave: Buffer) {
    if (clave.length !== 32) throw new Error('La clave maestra debe tener 32 bytes (256 bits)');
  }

  generarDek(): Buffer {
    return randomBytes(32);
  }

  cifrarCon(clave: Buffer, texto: string | Buffer): PaqueteCifrado {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', clave, iv);
    const datos = Buffer.isBuffer(texto) ? texto : Buffer.from(texto, 'utf8');
    const ct = Buffer.concat([c.update(datos), c.final()]);
    return { ct, iv, tag: c.getAuthTag() };
  }

  descifrarCon(clave: Buffer, paquete: PaqueteCifrado): Buffer {
    const d = createDecipheriv('aes-256-gcm', clave, paquete.iv);
    d.setAuthTag(paquete.tag);
    return Buffer.concat([d.update(paquete.ct), d.final()]);
  }
}
