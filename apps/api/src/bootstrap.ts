import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { env } from "./config/env";

/** Builds the configured app. Shared by main.ts and the e2e tests. */
export async function createApp(options: { logger?: boolean } = {}): Promise<NestFastifyApplication> {
  const config = env();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, bodyLimit: 1_048_576 }),
    { logger: options.logger === false ? false : ["error", "warn", "log"] },
  );

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-site" },
  });
  await app.register(fastifyCookie);

  app.enableCors({
    origin: config.CORS_ORIGINS.split(",").map((o) => o.trim()),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["content-type", "authorization", "x-csrf-token", "x-client"],
  });
  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();
  return app;
}
