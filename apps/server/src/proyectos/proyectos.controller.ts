import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ProyectosService } from './proyectos.service';

@Controller('api/proyectos')
export class ProyectosController {
  constructor(private readonly proyectos: ProyectosService) {}

  @Post()
  @HttpCode(201)
  crear(@Body() dto: { nombre: string; repoUrl?: string }) {
    return this.proyectos.crear(dto);
  }

  @Get()
  listar() {
    return this.proyectos.listar();
  }
}
