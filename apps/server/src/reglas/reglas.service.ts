import { Injectable } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ReglaProyecto {
  nombre: string;
  descripcion: string;
  prioridad: number;
  contenido: string;
  archivo: string;
}

// Reglas de proyecto (E05: "reglas de proyecto") en formato SKILL.md con frontmatter
// (name/description/prioridad). Se cargan del directorio del proyecto y se inyectan en el
// prompt del sistema del harness, ordenadas por prioridad (precedencia entre packs, §19).
@Injectable()
export class ReglasService {
  cargar(dirProyecto: string): ReglaProyecto[] {
    if (!existsSync(dirProyecto)) return [];
    const reglas: ReglaProyecto[] = [];
    for (const entrada of readdirSync(dirProyecto, { withFileTypes: true })) {
      if (!entrada.isDirectory()) continue;
      const archivo = join(dirProyecto, entrada.name, 'SKILL.md');
      if (!existsSync(archivo)) continue;
      try {
        const texto = readFileSync(archivo, 'utf8');
        const fm = texto.split('---')[1] ?? '';
        const campo = (k: string) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim();
        const nombre = campo('name') ?? entrada.name;
        const descripcion = campo('description') ?? '';
        const prioridad = Number(campo('prioridad') ?? 1);
        const cuerpo = texto.split('---').slice(2).join('---').trim();
        reglas.push({ nombre, descripcion, prioridad, contenido: cuerpo, archivo });
      } catch {
        /* SKILL.md ilegible: se ignora (no debe tumbar el harness) */
      }
    }
    return reglas.sort((a, b) => b.prioridad - a.prioridad);
  }

  // Las reglas de un proyecto viven en EDP_REGLAS_DIR/<proyectoId> (o ./reglas/<proyectoId> en dev)
  cargarDeProyecto(proyectoId: string): ReglaProyecto[] {
    const raiz = process.env.EDP_REGLAS_DIR ?? join(process.cwd(), 'reglas');
    return this.cargar(join(raiz, proyectoId));
  }

  // El bloque que se añade al prompt del sistema del harness
  promptDeReglas(reglas: ReglaProyecto[]): string {
    return promptDeReglas(reglas);
  }
}

// Función pura: el harness la usa sin depender del servicio
export function promptDeReglas(reglas: ReglaProyecto[]): string {
  if (!reglas.length) return '';
  const bloques = reglas
    .map((r, i) => `[regla ${i + 1}] ${r.nombre} (prioridad ${r.prioridad}):\n${r.contenido}`)
    .join('\n\n');
  return `\n\n## Reglas del proyecto (respétalas en TODO el plan y los pasos):\n${bloques}`;
}
