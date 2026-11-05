import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { REFRESH_COOKIE } from './auth/auth.controller.js';
import { ErrorResponseDto } from './common/dto/error-response.dto.js';
import { CorsIoAdapter } from './realtime/cors-io.adapter.js';
import {
  UPLOADS_URL_PREFIX,
  uploadDirOf,
} from './storage/local-storage.service.js';

/** Shared by `main.ts` and the e2e tests, so tests run against the real HTTP setup. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  const origins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  app.useWebSocketAdapter(new CorsIoAdapter(app, origins));

  // Files are only ever saved under generated names with a checked image type.
  app.useStaticAssets(uploadDirOf(config), {
    prefix: UPLOADS_URL_PREFIX,
    dotfiles: 'deny',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Stolchi API')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth(REFRESH_COOKIE)
      .build(),
    { extraModels: [ErrorResponseDto] },
  );
  SwaggerModule.setup('api/docs', app, document);
}
