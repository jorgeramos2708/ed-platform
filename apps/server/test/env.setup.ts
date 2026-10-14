// Setup de entorno para TODA la suite: BD de TEST separada del despliegue (edp_test),
// claves de prueba fuera del repo. Los workers del contenedor desplegado nunca compiten con la suite.
import { randomBytes } from 'node:crypto';

process.env.DATABASE_URL ??= 'postgres://edp:edp_dev@localhost:5433/edp_test';
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.EDP_MASTER_KEY ??= randomBytes(32).toString('hex');
