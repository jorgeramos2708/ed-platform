import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { ProyectosController } from './proyectos/proyectos.controller';
import { ProyectosService } from './proyectos/proyectos.service';
import { Auditoria } from './db/auditoria.entity';
import { Proyecto } from './db/proyecto.entity';
import { Usuario } from './db/usuario.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgres://edp:edp_dev@localhost:5433/edp',
      entities: [Usuario, Proyecto, Auditoria],
      synchronize: true, // SOLO desarrollo; migraciones versionadas antes del cierre de M1
    }),
    TypeOrmModule.forFeature([Proyecto, Auditoria]),
  ],
  controllers: [HealthController, ProyectosController],
  providers: [HealthService, ProyectosService],
})
export class AppModule {}
