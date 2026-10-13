import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { Auditoria, ActorTipo } from '../db/auditoria.entity';
import { Usuario, RolUsuario } from '../db/usuario.entity';

export type UsuarioSinHash = Omit<Usuario, 'passwordHash'>;

@Injectable()
export class UsuariosService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  // El PRIMER usuario registrado queda como admin (bootstrap self-hosted); los demás desarrollador
  async registrar(dto: { email: string; nombre: string; password: string }): Promise<UsuarioSinHash> {
    return this.dataSource.transaction(async (em) => {
      const usuarios = em.getRepository(Usuario);
      const existente = await usuarios.findOneBy({ email: dto.email });
      if (existente) throw new ConflictException('El email ya está registrado');
      const total = await usuarios.count();
      const rol = total === 0 ? RolUsuario.Admin : RolUsuario.Desarrollador;
      const passwordHash = await bcrypt.hash(dto.password, 10);
      const usuario = await usuarios.save(
        usuarios.create({ email: dto.email, nombre: dto.nombre, rol, passwordHash, activo: true }),
      );
      const auditoria = em.getRepository(Auditoria);
      await auditoria.save(
        auditoria.create({
          actorId: usuario.id,
          actorTipo: ActorTipo.Usuario,
          accion: 'auth.registro',
          recursoTipo: 'usuario',
          recursoId: usuario.id,
          detalle: { email: usuario.email, rol },
        }),
      );
      return this.sinHash(usuario);
    });
  }

  async login(dto: { email: string; password: string }): Promise<{ token: string; usuario: UsuarioSinHash }> {
    const usuarios = this.dataSource.getRepository(Usuario);
    const usuario = await usuarios.findOneBy({ email: dto.email });
    if (!usuario || !(await bcrypt.compare(dto.password, usuario.passwordHash))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const auditoria = this.dataSource.getRepository(Auditoria);
    await auditoria.save(
      auditoria.create({
        actorId: usuario.id,
        actorTipo: ActorTipo.Usuario,
        accion: 'auth.login',
        recursoTipo: 'usuario',
        recursoId: usuario.id,
        detalle: { email: usuario.email },
      }),
    );
    const token = await this.jwtService.signAsync({
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
    });
    return { token, usuario: this.sinHash(usuario) };
  }

  private sinHash(usuario: Usuario): UsuarioSinHash {
    const { passwordHash: _omitido, ...resto } = usuario;
    return resto;
  }
}
