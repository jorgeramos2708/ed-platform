// F5-1 (RED): parser de pipelines como código (.edp-pipeline.yml) — la definición del E09
import { describe, it, expect } from 'vitest';
import { PipelineService } from './pipeline.service';

const parser = new PipelineService();

describe('PipelineService.parsear — pipelines como código (F5-1)', () => {
  it('parsea un pipeline válido con etapas y comandos', () => {
    const yaml = `
stages:
  - nombre: instalar
    comandos:
      - npm ci
  - nombre: probar
    comandos:
      - npm test
  - nombre: construir
    comandos:
      - npm run build
artefactos:
  - ruta: dist/**
    etiqueta: notas-api
`;
    const pipeline = parser.parsear(yaml);
    expect(pipeline.etapas).toHaveLength(3);
    expect(pipeline.etapas[0]).toEqual({ nombre: 'instalar', comandos: ['npm ci'] });
    expect(pipeline.etapas[2].nombre).toBe('construir');
    expect(pipeline.artefactos).toEqual([{ ruta: 'dist/**', etiqueta: 'notas-api' }]);
  });

  it('acepta un pipeline mínimo sin artefactos', () => {
    const yaml = `
stages:
  - nombre: probar
    comandos: [npm test]
`;
    const pipeline = parser.parsear(yaml);
    expect(pipeline.etapas).toHaveLength(1);
    expect(pipeline.artefactos).toEqual([]);
  });

  it('rechaza un YAML sin etapas', () => {
    expect(() => parser.parsear('artefactos: []')).toThrow(/sin etapas/i);
  });

  it('rechaza una etapa sin nombre o sin comandos', () => {
    expect(() => parser.parsear('stages:\n  - comandos: [echo x]')).toThrow(/nombre/i);
    expect(() => parser.parsear('stages:\n  - nombre: vacia')).toThrow(/comandos/i);
  });

  it('rechaza comandos que no sean una lista de strings', () => {
    expect(() =>
      parser.parsear('stages:\n  - nombre: x\n    comandos: [42, true]'),
    ).toThrow(/comandos/i);
  });

  it('rechaza un YAML que no sea un objeto', () => {
    expect(() => parser.parsear('- solo\n- una\n- lista')).toThrow(/formato/i);
  });
});
