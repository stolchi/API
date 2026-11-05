import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { REFRESH_COOKIE } from './auth/auth.controller.js';
import { ErrorResponseDto } from './common/dto/error-response.dto.js';

/** Shared by `main.ts` and the e2e tests, so tests run against the real HTTP setup. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({
    origin: config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
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
