import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

// Valida el Bearer y expone req.usuario = {sub, email, rol} para el resto de guards
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const encabezado: string | undefined = req.headers['authorization'];
    if (!encabezado?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el token Bearer');
    }
    try {
      req.usuario = await this.jwtService.verifyAsync(encabezado.slice(7));
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
