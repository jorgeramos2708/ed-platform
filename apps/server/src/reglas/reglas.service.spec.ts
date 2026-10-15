// RED: ReglasService — carga de reglas de proyecto en formato SKILL.md con precedencia
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReglasService } from './reglas.service';

let raiz: string;

beforeAll(() => {
  raiz = mkdtempSync(join(tmpdir(), 'edp-reglas-'));
  // regla de alta prioridad
  mkdirSync(join(raiz, 'proyecto-a', 'estilo'), { recursive: true });
  writeFileSync(
    join(raiz, 'proyecto-a', 'estilo', 'SKILL.md'),
    '---\nname: estilo-codigo\ndescription: Convenciones de estilo del proyecto. Use when writing or editing code.\nprioridad: 10\n---\nUsa TypeScript estricto y sin any.\n',
  );
  // regla de baja prioridad (mismo tema)
  mkdirSync(join(raiz, 'proyecto-a', 'general'), { recursive: true });
  writeFileSync(
    join(raiz, 'proyecto-a', 'general', 'SKILL.md'),
    '---\nname: general\ndescription: Reglas generales de código para cualquier cambio.\nprioridad: 1\n---\nSé conciso.\n',
  );
  // archivo suelto que NO es SKILL.md (debe ignorarse)
  writeFileSync(join(raiz, 'proyecto-a', 'otro.md'), '---\nname: no\n---\nx');
});

afterEach(() => {});
// la limpieza del tmp se deja al SO (tmpdir)

describe('ReglasService', () => {
  const service = new ReglasService();

  it('carga las reglas SKILL.md de un proyecto con su contenido', () => {
    const reglas = service.cargar(join(raiz, 'proyecto-a'));
    expect(reglas).toHaveLength(2);
    const estilo = reglas.find((r) => r.nombre === 'estilo-codigo');
    expect(estilo?.contenido).toContain('TypeScript estricto');
    expect(estilo?.prioridad).toBe(10);
  });

  it('ordena por prioridad descendente (la de mayor prioridad primero)', () => {
    const reglas = service.cargar(join(raiz, 'proyecto-a'));
    expect(reglas[0].nombre).toBe('estilo-codigo');
    expect(reglas[1].nombre).toBe('general');
  });

  it('devuelve lista vacía (sin error) para un proyecto sin reglas', () => {
    expect(service.cargar(join(raiz, 'inexistente'))).toEqual([]);
  });

  it('inyecta las reglas en el prompt del sistema, ordenadas por prioridad', () => {
    const reglas = service.cargar(join(raiz, 'proyecto-a'));
    const prompt = service.promptDeReglas(reglas);
    expect(prompt).toContain('[regla 1] estilo-codigo');
    expect(prompt).toContain('TypeScript estricto');
    expect(prompt.indexOf('estilo-codigo')).toBeLessThan(prompt.indexOf('general'));
  });
});
