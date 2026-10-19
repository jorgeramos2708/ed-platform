import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SecretosModule } from '../secretos/secretos.module';
import { ProyectosModule } from '../proyectos/proyectos.module';
import { ColaModule } from '../cola/cola.module';
import { ServidoresModule } from '../servidores/servidores.module';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { GitService } from '../git/git.service';
import { SondeoRemotosService } from '../git/sondeo-remotos.service';
import { TerminalBridgeService } from '../servidores/terminal-bridge.service';
import { SesionTerminal } from '../db/sesion-terminal.entity';
import { CorridaCi } from '../db/corrida-ci.entity';
import { CorridaEtapa } from '../db/corrida-etapa.entity';
import { Artefacto } from '../db/artefacto.entity';
import { CiService } from '../ci/ci.service';
import { PipelineService } from '../ci/pipeline.service';
import { CiController } from '../ci/ci.controller';

// Los guards del controller resuelven desde ESTE módulo: necesita JwtService (AuthModule lo exporta)
// GitService vive aquí (solo depende de WorkspacesService); el controller usa ProyectosService
// (obtener repo_url/rama) y SecretosService (PAT del vault por nombre 'github-token').
// SondeoRemotosService (F3-4): intervalo que audita avances del origen (EDP_POLL_REMOTOS_SEG=0 lo apaga)
@Module({
  imports: [
    AuthModule,
    SecretosModule,
    ProyectosModule,
    ServidoresModule,
    ColaModule,
    TypeOrmModule.forFeature([SesionTerminal, CorridaCi, CorridaEtapa, Artefacto]),
  ],
  controllers: [WorkspacesController, CiController],
  providers: [WorkspacesService, GitService, SondeoRemotosService, TerminalBridgeService, CiService, PipelineService],
  exports: [WorkspacesService, GitService, SondeoRemotosService, TerminalBridgeService, CiService],
})
export class WorkspacesModule {}
