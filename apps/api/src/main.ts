import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import type { Env } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Strips unknown properties and validates incoming request payloads
  // globally, so every future module's DTOs get this for free.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Allow any origin so client laptops on the LAN (http://<server-ip>:5173)
  // can call this API. Auth uses a Bearer token in the Authorization header,
  // not cookies, so credentialed CORS is not required. Tighten this to a
  // specific origin list for a real deployment.
  app.enableCors({ origin: true });

  const configService = app.get(ConfigService<Env, true>);
  const port = configService.get('PORT', { infer: true });

  // Bind to 0.0.0.0 (all network interfaces), not just localhost, so other
  // devices on the same LAN can reach the API by this machine's IP address.
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(
    `API listening on http://0.0.0.0:${port} — on the LAN, clients reach it at http://<this-machine-ip>:${port}`,
  );
}

bootstrap();
