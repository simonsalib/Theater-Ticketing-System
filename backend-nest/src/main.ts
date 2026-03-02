import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Enable CORS for frontend (adjust origin later)
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // ✅ IMPORTANT: Use Azure-provided port
  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Backend running on port ${port}`);
}
bootstrap();
