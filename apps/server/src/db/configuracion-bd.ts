import { MigracionInicial1771000000000 } from '../migrations/0001-migracion-inicial.migration';
import { GastoIaMigracion1771000000001 } from '../migrations/0002-gasto-ia.migration';
import { Auditoria } from './auditoria.entity';
import { GastoIa } from './gasto-ia.entity';
import { Proyecto } from './proyecto.entity';
import { Secreto } from './secreto.entity';
import { Trabajo } from './trabajo.entity';
import { Usuario } from './usuario.entity';

// Configuración ÚNICA de base de datos para la app y los tests:
// el esquema vive SOLO en migraciones (migrationsRun) — synchronize prohibido (CONSTRAINTS/M1)
// (sin deep-imports de typeorm: la ruta interna cambia entre versiones y rompe el build en contenedor)
export function configuracionBd() {
  return {
    type: 'postgres' as const,
    url: process.env.DATABASE_URL ?? 'postgres://edp:edp_dev@localhost:5433/edp',
    entities: [Usuario, Proyecto, Auditoria, Secreto, Trabajo, GastoIa],
    migrations: [MigracionInicial1771000000000, GastoIaMigracion1771000000001],
    migrationsRun: true,
    synchronize: false,
  };
}
