// Setup de entorno para TODA la suite: claves de prueba fuera del repo, BD del compose
import { randomBytes } from 'node:crypto';

process.env.DATABASE_URL ??= 'postgres://edp:edp_dev@localhost:5433/edp';
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.EDP_MASTER_KEY ??= randomBytes(32).toString('hex');
