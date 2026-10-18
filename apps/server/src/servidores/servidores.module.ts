import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SecretosModule } from '../secretos/secretos.module';
import { ServidoresService } from './servidores.service';
import { SshService } from './ssh.service';
import { ServidoresController } from './servidores.controller';

// Fase 4: catálogo + SSH. Los guards del controller necesitan JwtService (AuthModule);
// SshService consume el vault (SecretosService) para la credencial just-in-time
@Module({
  imports: [AuthModule, SecretosModule],
  controllers: [ServidoresController],
  providers: [ServidoresService, SshService],
  exports: [ServidoresService, SshService],
})
export class ServidoresModule {}
