import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Auditoria } from '../db/auditoria.entity';
import { Secreto } from '../db/secreto.entity';
import { CifradorService } from './cifrador.service';
import { SecretosController } from './secretos.controller';
import { SecretosService } from './secretos.service';

// La clave maestra vive FUERA de la BD y del repo (ADR-0005/0011):
// 1. env EDP_MASTER_KEY (hex 64) — para tests
// 2. archivo EDP_MASTER_KEY_FILE — para la instalación (persistido en volumen; respaldo cifrado aparte, decisión 15)
function cargarClaveMaestra(): CifradorService {
  let hex = process.env.EDP_MASTER_KEY;
  const archivo = process.env.EDP_MASTER_KEY_FILE;
  if (!hex && archivo && existsSync(archivo)) {
    hex = readFileSync(archivo, 'utf8').trim();
  }
  if (!hex && archivo) {
    hex = randomBytes(32).toString('hex');
    writeFileSync(archivo, hex, { mode: 0o600 });
    // Se registra la RUTA, jamás el contenido (CONSTRAINTS §1.2)
    console.log(`[secretos] clave maestra generada en ${archivo} — respáldala cifrada aparte (decisión 15)`);
  }
  if (!hex) {
    throw new Error('Falta la clave maestra: define EDP_MASTER_KEY o EDP_MASTER_KEY_FILE');
  }
  return new CifradorService(Buffer.from(hex, 'hex'));
}

@Module({
  imports: [TypeOrmModule.forFeature([Secreto, Auditoria]), AuthModule],
  controllers: [SecretosController],
  providers: [SecretosService, { provide: CifradorService, useFactory: cargarClaveMaestra }],
  exports: [SecretosService],
})
export class SecretosModule {}
