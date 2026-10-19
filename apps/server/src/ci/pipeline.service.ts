import { Injectable } from '@nestjs/common';
import { parse as parsearYaml } from 'yaml';

export interface EtapaPipeline {
  nombre: string;
  comandos: string[];
}

export interface ArtefactoDefinido {
  ruta: string;
  etiqueta: string;
}

export interface PipelineDefinido {
  etapas: EtapaPipeline[];
  artefactos: ArtefactoDefinido[];
}

// F5-1: pipelines como código (E09) — la definición .edp-pipeline.yml del repositorio.
// El parser valida la estructura ANTES de ejecutar nada (falla rápido y con mensaje claro).
@Injectable()
export class PipelineService {
  parsear(yaml: string): PipelineDefinido {
    let documento: unknown;
    try {
      documento = parsearYaml(yaml);
    } catch (e) {
      throw new Error(`El pipeline (.edp-pipeline.yml) no es YAML válido: ${(e as Error).message}`);
    }
    if (!documento || typeof documento !== 'object' || Array.isArray(documento)) {
      throw new Error('Formato de pipeline inválido: se esperaba un objeto con stages');
    }
    const doc = documento as Record<string, unknown>;
    const etapasCrudas = doc.stages;
    if (!Array.isArray(etapasCrudas) || etapasCrudas.length === 0) {
      throw new Error('Pipeline sin etapas: define al menos una entrada en stages');
    }
    const etapas: EtapaPipeline[] = etapasCrudas.map((cruda, indice) => {
      const etapa = cruda as Record<string, unknown>;
      const nombre = typeof etapa.nombre === 'string' ? etapa.nombre.trim() : '';
      if (!nombre) throw new Error(`Etapa ${indice + 1}: falta el nombre`);
      const comandos = etapa.comandos;
      if (!Array.isArray(comandos) || comandos.length === 0 || comandos.some((c) => typeof c !== 'string' || !c.trim())) {
        throw new Error(`Etapa "${nombre}": comandos debe ser una lista no vacía de strings`);
      }
      return { nombre, comandos: comandos as string[] };
    });
    const artefactos: ArtefactoDefinido[] = Array.isArray(doc.artefactos)
      ? (doc.artefactos as Record<string, unknown>[]).map((a, i) => {
          const ruta = typeof a.ruta === 'string' ? a.ruta : '';
          if (!ruta) throw new Error(`Artefacto ${i + 1}: falta la ruta`);
          return { ruta, etiqueta: typeof a.etiqueta === 'string' ? a.etiqueta : ruta };
        })
      : [];
    return { etapas, artefactos };
  }
}
