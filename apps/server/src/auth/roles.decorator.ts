import { SetMetadata } from '@nestjs/common';
import { RolUsuario } from '../db/usuario.entity';

export const ROLES_KEY = 'roles';
// Denegado por defecto: si un handler declara @Roles(...), solo esos roles pasan (matriz-permisos)
export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_KEY, roles);
