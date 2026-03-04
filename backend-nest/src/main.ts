import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Increase body size limit for base64 image uploads (profile pictures, QR codes, receipts)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

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
