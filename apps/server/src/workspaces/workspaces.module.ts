import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SecretosModule } from '../secretos/secretos.module';
import { ProyectosModule } from '../proyectos/proyectos.module';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { GitService } from '../git/git.service';
import { SondeoRemotosService } from '../git/sondeo-remotos.service';

// Los guards del controller resuelven desde ESTE módulo: necesita JwtService (AuthModule lo exporta)
// GitService vive aquí (solo depende de WorkspacesService); el controller usa ProyectosService
// (obtener repo_url/rama) y SecretosService (PAT del vault por nombre 'github-token').
// SondeoRemotosService (F3-4): intervalo que audita avances del origen (EDP_POLL_REMOTOS_SEG=0 lo apaga)
@Module({
  imports: [AuthModule, SecretosModule, ProyectosModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, GitService, SondeoRemotosService],
  exports: [WorkspacesService, GitService, SondeoRemotosService],
})
export class WorkspacesModule {}
