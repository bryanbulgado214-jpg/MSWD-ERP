// Application smoke test.
//
// Unit tests exercise services in isolation with mocks, so they cannot see two
// whole classes of breakage that only surface when the *real* application boots:
//
//   1. Dependency-injection / wiring failures — e.g. a constructor-injected
//      provider imported as `import type` (erased at runtime), which makes Nest
//      unable to resolve the module graph and the app refuses to start.
//   2. Request-pipeline failures — e.g. a `@Body()` DTO imported as `import type`,
//      whose metatype erases to `Object` so the global ValidationPipe silently
//      skips validation and the handler receives an empty body.
//
// Both actually happened (a lint autofix rewrote injected providers and DTOs to
// `import type`); tsc and the unit suite stayed green while the API 500'd on
// boot/login. This test boots the ENTIRE module tree and drives real HTTP
// requests through the same global ValidationPipe as production, so either
// failure is caught in CI instead of at runtime.
//
// It needs no database: PrismaService is replaced with an in-memory stub (the
// only boot-time DB work is PrismaService.$connect). Overriding the Prisma token
// does NOT mask a broken injected import — the failing provider's *own* param
// metadata is still unresolvable, so the DI check remains valid.
import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';

const prismaStub = {
  $connect: async () => undefined,
  $disconnect: async () => undefined,
  user: {
    findFirst: async () => null, // unknown user → auth returns 401 (never 500)
    update: async () => ({}),
  },
};

describe('application smoke test (full boot + request pipeline)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleRef.createNestApplication();
    // Mirror main.ts so the request pipeline matches production.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('resolves the entire dependency graph (catches broken DI / type-only injected providers)', () => {
    expect(app).toBeDefined();
  });

  it('POST /auth/login rejects an invalid body with 400 (catches a DTO imported as type-only)', async () => {
    // If LoginDto were a type-only import its metatype erases to Object, the
    // ValidationPipe skips it, and the empty body would slip through (→ 401),
    // not be rejected. A 400 proves the DTO class reached the pipe as a value.
    const res = await request(app.getHttpServer()).post('/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('POST /auth/login runs the full auth pipeline (bad credentials → 401, never 500)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'nobody', password: 'definitely-wrong' });
    expect(res.status).toBe(401);
  });
});
