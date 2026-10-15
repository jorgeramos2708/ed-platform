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
import { WorkspacesModule } from './workspaces/workspaces.module';
import { configuracionBd } from './db/configuracion-bd';

@Module({
  imports: [
    TypeOrmModule.forRoot(configuracionBd()),
    AuthModule,
    ColaModule,
    SecretosModule,
    WorkspacesModule,
    CoreModule,
  ],
  controllers: [HealthController, ProyectosController],
  providers: [HealthService, ProyectosService],
})
export class AppModule {}
