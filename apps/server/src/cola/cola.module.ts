import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Trabajo } from '../db/trabajo.entity';
import { TrabajosController } from './trabajos.controller';
import { TrabajosService } from './trabajos.service';

// Los guards del controller resuelven desde ESTE módulo: necesita JwtService (AuthModule lo exporta)
@Module({
  imports: [TypeOrmModule.forFeature([Trabajo]), AuthModule],
  controllers: [TrabajosController],
  providers: [TrabajosService],
  exports: [TrabajosService],
})
export class ColaModule implements OnModuleInit {
  constructor(private readonly trabajos: TrabajosService) {}

  // Handler de mantenimiento de plataforma (el dominio real llegará en slices siguientes)
  async onModuleInit() {
    this.trabajos.registrarWorker('mantenimiento', async (payload) => payload);
  }
}
