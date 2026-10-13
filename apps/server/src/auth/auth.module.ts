import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Auditoria } from '../db/auditoria.entity';
import { Usuario } from '../db/usuario.entity';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { UsuariosService } from './usuarios.service';

// JWT_SECRET: en desarrollo, valor por defecto marcado como no-producción;
// el instalador (ADR-0011) generará uno real por instalación y vivirá fuera del repo
@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario, Auditoria]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'edp-dev-secret-no-produccion',
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [AuthController],
  providers: [UsuariosService, JwtAuthGuard, RolesGuard],
  exports: [UsuariosService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
