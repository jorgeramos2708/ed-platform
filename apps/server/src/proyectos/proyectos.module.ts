import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProyectosController } from './proyectos.controller';
import { ProyectosService } from './proyectos.service';

// Fase 3: el módulo propio permite que WorkspacesModule consuma ProyectosService (repo_url/rama)
// Los guards del controller resuelven desde ESTE módulo: necesita JwtService (AuthModule lo exporta)
@Module({
  imports: [AuthModule],
  controllers: [ProyectosController],
  providers: [ProyectosService],
  exports: [ProyectosService],
})
export class ProyectosModule {}
