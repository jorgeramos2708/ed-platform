import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggerSeguro } from './core/logger-seguro.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: false });
  // Logger estructurado con redacción garantizada — el único canal de logs de la app
  app.useLogger(await app.resolve(LoggerSeguro));
  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port);
  console.log(`[edp] API escuchando en http://localhost:${port}/api/health`);
}
bootstrap();
