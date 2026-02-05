import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Habilita CORS para facilitar testes
  app.enableCors();
  
  await app.listen(3000);
  console.log('🚀 Orders Service rodando na porta 3000');
}
bootstrap();
