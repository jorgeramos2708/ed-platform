import { Global, Module } from '@nestjs/common';
import { SanitizadorService } from '../secretos/sanitizador.service';
import { LoggerSeguro } from './logger-seguro.service';

// Infraestructura compartida global: UNA sola instancia del sanitizador en toda la app,
// para que el registro de valores prohibidos sea el mismo en todos los módulos
@Global()
@Module({
  providers: [SanitizadorService, LoggerSeguro],
  exports: [SanitizadorService, LoggerSeguro],
})
export class CoreModule {}
