import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Auditoria, ActorTipo } from '../db/auditoria.entity';
import { RolUsuario } from '../db/usuario.entity';
import { ROLES_KEY } from './roles.decorator';

// Guard de la matriz de permisos: toda DENEGACIÓN se audita (matriz-permisos, regla de coerción 2)
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requeridos = this.reflector.getAllAndOverride<RolUsuario[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requeridos?.length) return true;

    const req = context.switchToHttp().getRequest();
    const usuario = req.usuario as { sub?: string; rol?: RolUsuario } | undefined;
    if (usuario?.rol && requeridos.includes(usuario.rol)) return true;

    const auditoria = this.dataSource.getRepository(Auditoria);
    await auditoria.save(
      auditoria.create({
        actorId: usuario?.sub ?? 'desconocido',
        actorTipo: ActorTipo.Usuario,
        accion: 'auth.denegado',
        recursoTipo: 'endpoint',
        recursoId: `${req.method} ${req.url}`,
        detalle: { rolActual: usuario?.rol ?? 'anonimo', rolesRequeridos: requeridos },
      }),
    );
    throw new ForbiddenException('Rol insuficiente para esta acción');
  }
}
