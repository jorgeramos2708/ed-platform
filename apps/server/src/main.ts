import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port);
  console.log(`[edp] API escuchando en http://localhost:${port}/api/health`);
}
bootstrap();
