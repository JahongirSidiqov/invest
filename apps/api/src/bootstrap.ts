import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';

/** Shared app setup for main.ts, the OpenAPI generator and integration tests. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('v1');
  // Behind the load balancer: trust the first proxy so @Ip() is the client address.
  (app as NestExpressApplication).set('trust proxy', 1);
  (app as NestExpressApplication).disable('x-powered-by');
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Invest API')
    .setVersion('1')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  return { ...doc, openapi: '3.1.0' };
}
