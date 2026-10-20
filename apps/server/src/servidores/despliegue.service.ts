import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { Client } from 'ssh2';
import { Despliegue } from '../db/despliegue.entity';
import { DesplieguePaso } from '../db/despliegue-paso.entity';
import { SecretosService } from '../secretos/secretos.service';
import { ServidoresService } from './servidores.service';

const execAsync = promisify(exec);

export interface ResultadoPaso {
  ok: boolean;
  detalle: string;
}

// Fase 6 (E10): el desplegador — Recreate por SSH con verificación de versión + health.
// La máquina de estados NUNCA marca exitoso sin: versión detectada == esperada Y health verde.
// La credencial viaja just-in-time del vault; los pasos quedan auditados (reporte del despliegue).
@Injectable()
export class DespliegueService {
  constructor(
    private readonly secretos: SecretosService,
    private readonly servidores: ServidoresService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // La ruta del artefacto en el host del despliegue (v1: /opt/<proyecto>/<versión>)
  rutaApp(proyectoSlug: string, version: string): string {
    return `/opt/${proyectoSlug}/${version}`;
  }

  private async paso(
    despliegueId: string,
    orden: number,
    nombre: string,
    accion: () => Promise<ResultadoPaso>,
  ): Promise<boolean> {
    const repo = this.dataSource.getRepository(DesplieguePaso);
    const fila = await repo.save(repo.create({ despliegueId, nombre, estado: 'ejecutando', orden }));
    try {
      const r = await accion();
      await repo.update(
        { id: fila.id },
        { estado: r.ok ? 'exitoso' : 'fallido', detalle: r.detalle },
      );
      return r.ok;
    } catch (e) {
      await repo.update({ id: fila.id }, { estado: 'fallido', detalle: (e as Error).message });
      return false;
    }
  }

  // Ejecuta un comando SSH en el servidor del despliegue
  async sshExec(
    servidorId: string,
    comando: string,
  ): Promise<{ codigo: number; salida: string; salidaError: string }> {
    const servidor = await this.servidores.obtener(servidorId);
    const credencial = await this.secretos.usarPorId(servidor.credencialId);
    return new Promise((resolver, rechazar) => {
      const conn = new Client();
      const temporizador = setTimeout(() => {
        conn.end();
        rechazar(new Error(`SSH timeout: ${servidor.host}:${servidor.puerto}`));
      }, 30000);
      conn
        .on('ready', () => {
          conn.exec(comando, (err, stream) => {
            if (err) {
              clearTimeout(temporizador);
              rechazar(err);
              return;
            }
            let salida = '';
            stream
              .on('close', (code: number) => {
                clearTimeout(temporizador);
                conn.end();
                resolver({ codigo: code ?? -1, salida, salidaError: '' });
              })
              .on('data', (d: Buffer) => {
                salida += d.toString('utf8');
              });
          });
        })
        .on('error', (e) => {
          clearTimeout(temporizador);
          rechazar(e);
        })
        .connect({
          host: servidor.host,
          port: servidor.puerto,
          username: servidor.usuarioSsh,
          readyTimeout: 15000,
          ...(credencial.valor.includes('PRIVATE KEY')
            ? { privateKey: credencial.valor }
            : { password: credencial.valor }),
        });
    });
  }

  // Health check HTTP (desde la plataforma) — vivo + JSON esperado
  async healthCheck(url: string, esperado: string): Promise<{ ok: boolean; detalle: string }> {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const cuerpo = await r.text();
      const ok = r.status === 200 && cuerpo.includes(esperado);
      return { ok, detalle: `HTTP ${r.status}: ${cuerpo.slice(0, 100)}` };
    } catch (e) {
      return { ok: false, detalle: (e as Error).message };
    }
  }

  // Rollback: re-desplegar el artefacto del despliegue previo exitoso
  async rollback(
    despliegueId: string,
    usuarioId: string,
    desplegador: (d: Despliegue) => Promise<void>,
  ): Promise<Despliegue> {
    const repo = this.dataSource.getRepository(Despliegue);
    const despliegue = await repo.findOneByOrFail({ id: despliegueId });
    if (!despliegue.desplieguePrevioId) {
      throw new Error('No hay despliegue previo al que hacer rollback');
    }
    await repo.update({ id: despliegue.id }, { estado: 'en_rollback' });
    const previo = await repo.findOneByOrFail({ id: despliegue.desplieguePrevioId });
    await this.auditar(despliegue.id, 'despliegue.rollback', { hacia: previo.artefactoId });
    await desplegador(previo);
    return repo.findOneByOrFail({ id: previo.id });
  }

  private async auditar(recursoId: string, accion: string, detalle: Record<string, unknown>): Promise<void> {
    await this.dataSource.getRepository(DesplieguePaso).save(
      this.dataSource.getRepository(DesplieguePaso).create({
        despliegueId: recursoId,
        nombre: accion,
        estado: 'exitoso',
        orden: 999,
        detalle: JSON.stringify(detalle),
      }),
    );
  }
}

export function leerSiExiste(ruta: string): string | null {
  try {
    return readFileSync(ruta, 'utf8');
  } catch {
    return null;
  }
}

export { execAsync };
