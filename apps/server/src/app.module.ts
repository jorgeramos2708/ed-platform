import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { ColaModule } from './cola/cola.module';
import { CoreModule } from './core/core.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { ProyectosController } from './proyectos/proyectos.controller';
import { ProyectosService } from './proyectos/proyectos.service';
import { SecretosModule } from './secretos/secretos.module';
import { Auditoria } from './db/auditoria.entity';
import { Proyecto } from './db/proyecto.entity';
import { Secreto } from './db/secreto.entity';
import { Usuario } from './db/usuario.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgres://edp:edp_dev@localhost:5433/edp',
      entities: [Usuario, Proyecto, Auditoria, Secreto],
      synchronize: true, // SOLO desarrollo; migraciones versionadas antes del cierre de M1
    }),
    AuthModule,
    ColaModule,
    SecretosModule,
    CoreModule,
  ],
  controllers: [HealthController, ProyectosController],
  providers: [HealthService, ProyectosService],
})
export class AppModule {}
