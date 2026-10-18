import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SecretosModule } from '../secretos/secretos.module';
import { ProyectosModule } from '../proyectos/proyectos.module';
import { ServidoresModule } from '../servidores/servidores.module';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { GitService } from '../git/git.service';
import { SondeoRemotosService } from '../git/sondeo-remotos.service';
import { TerminalBridgeService } from '../servidores/terminal-bridge.service';
import { SesionTerminal } from '../db/sesion-terminal.entity';

// Los guards del controller resuelven desde ESTE módulo: necesita JwtService (AuthModule lo exporta)
// GitService vive aquí (solo depende de WorkspacesService); el controller usa ProyectosService
// (obtener repo_url/rama) y SecretosService (PAT del vault por nombre 'github-token').
// SondeoRemotosService (F3-4): intervalo que audita avances del origen (EDP_POLL_REMOTOS_SEG=0 lo apaga)
@Module({
  imports: [AuthModule, SecretosModule, ProyectosModule, ServidoresModule, TypeOrmModule.forFeature([SesionTerminal])],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, GitService, SondeoRemotosService, TerminalBridgeService],
  exports: [WorkspacesService, GitService, SondeoRemotosService, TerminalBridgeService],
})
export class WorkspacesModule {}
