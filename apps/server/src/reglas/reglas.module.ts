import { Global, Module } from '@nestjs/common';
import { ReglasService } from './reglas.service';

// Global: el harness y futuros módulos cargan las reglas del proyecto sin importar el módulo
@Global()
@Module({
  providers: [ReglasService],
  exports: [ReglasService],
})
export class ReglasModule {}
