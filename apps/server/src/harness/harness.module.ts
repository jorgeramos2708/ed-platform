import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { CheckpointsModule } from '../checkpoints/checkpoints.module';
import { ProveedorAnthropic } from './proveedores/anthropic.proveedor';
import { CADENA_PROVEEDORES, ProveedorIA } from './proveedor-ia';
import { ProveedorOpenAICompatible } from './proveedores/openai-compatible.proveedor';
import { HarnessController } from './harness.controller';
import { HarnessService } from './harness.service';
import { ChatService } from './chat.service';

// Cadena de proveedores desde entorno (decisión 3: principal + respaldo). Sin key = cadena vacía
// (la app arranca; los endpoints de IA responden 503). Las keys JAMÁS van al repo (CONSTRAINTS §1.2).
function construirCadena(): ProveedorIA[] {
  const cadena: ProveedorIA[] = [];
  if (process.env.EDP_AI_API_KEY) {
    cadena.push(
      new ProveedorOpenAICompatible({
        nombre: process.env.EDP_AI_NOMBRE ?? 'principal',
        baseUrl: process.env.EDP_AI_BASE_URL ?? 'https://api.openai.com/v1',
        apiKey: process.env.EDP_AI_API_KEY,
        modelo: process.env.EDP_AI_MODELO ?? 'gpt-4o-mini',
      }),
    );
  }
  if (process.env.EDP_AI_RESPALDO_API_KEY) {
    cadena.push(
      process.env.EDP_AI_RESPALDO_TIPO === 'anthropic'
        ? new ProveedorAnthropic({
            nombre: 'respaldo',
            apiKey: process.env.EDP_AI_RESPALDO_API_KEY,
            modelo: process.env.EDP_AI_RESPALDO_MODELO ?? 'claude-sonnet-4-5',
          })
        : new ProveedorOpenAICompatible({
            nombre: 'respaldo',
            baseUrl: process.env.EDP_AI_RESPALDO_BASE_URL ?? 'https://api.openai.com/v1',
            apiKey: process.env.EDP_AI_RESPALDO_API_KEY,
            modelo: process.env.EDP_AI_RESPALDO_MODELO ?? 'gpt-4o-mini',
          }),
    );
  }
  return cadena;
}

// Los guards del controller resuelven desde ESTE módulo: necesita JwtService (AuthModule lo exporta)
@Module({
  imports: [WorkspacesModule, CheckpointsModule, AuthModule],
  controllers: [HarnessController],
  providers: [
    HarnessService,
    ChatService,
    { provide: CADENA_PROVEEDORES, useFactory: construirCadena },
  ],
  exports: [HarnessService, ChatService],
})
export class HarnessModule {}
