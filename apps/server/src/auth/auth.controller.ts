import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Post('registro')
  @HttpCode(201)
  registrar(@Body() dto: { email: string; nombre: string; password: string }) {
    return this.usuarios.registrar(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: { email: string; password: string }) {
    return this.usuarios.login(dto);
  }
}
