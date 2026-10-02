import {
  HttpStatus,
  type INestApplication,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppLogger } from "../observability/app-logger.service";
import { createHttpObservabilityMiddleware } from "../observability/http-observability.middleware";
import { ObservabilityMetrics } from "../observability/metrics.service";

type CorsOriginCallback = (error: Error | null, allow?: boolean) => void;

type BodyParserApplication = INestApplication & {
  useBodyParser(
    parser: "json",
    options: { limit: number; strict: boolean },
  ): INestApplication;
};

type MiddlewareRequest = {
  body?: unknown;
  method: string;
  originalUrl?: string;
  url?: string;
};

type MiddlewareResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): MiddlewareResponse;
  json(body: unknown): void;
};

const JSON_BODY_LIMIT_BYTES = 256 * 1024;
const MAX_JSON_DEPTH = 20;
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const UNSUPPORTED_METHODS = new Set(["CONNECT", "TRACE"]);

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService);
  const webOrigin = config.getOrThrow<string>("WEB_ORIGIN");
  const production = config.getOrThrow<string>("NODE_ENV") === "production";

  app.use(
    createHttpObservabilityMiddleware(
      app.get(AppLogger),
      app.get(ObservabilityMetrics),
    ),
  );

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      strictTransportSecurity: production
        ? { includeSubDomains: false, maxAge: 31_536_000, preload: false }
        : false,
    }),
  );
  app.use(
    (
      request: MiddlewareRequest,
      response: MiddlewareResponse,
      next: () => void,
    ) => {
      response.setHeader("Cache-Control", "private, no-store");
      response.setHeader("Pragma", "no-cache");
      if (UNSUPPORTED_METHODS.has(request.method.toUpperCase())) {
        response.status(HttpStatus.METHOD_NOT_ALLOWED).json({
          code: "METHOD_NOT_ALLOWED",
          message: "Method not allowed",
          path: request.originalUrl ?? request.url ?? "/",
          statusCode: HttpStatus.METHOD_NOT_ALLOWED,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      next();
    },
  );

  app.enableCors({
    allowedHeaders: ["Content-Type", "X-Request-ID", "X-TripForge-Request"],
    credentials: true,
    exposedHeaders: ["X-Request-ID"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    origin: (
      requestOrigin: string | undefined,
      callback: CorsOriginCallback,
    ) => {
      callback(null, requestOrigin === undefined || requestOrigin === webOrigin);
    },
  });
  (app as BodyParserApplication).useBodyParser("json", {
    limit: JSON_BODY_LIMIT_BYTES,
    strict: true,
  });
  app.use(
    (
      request: MiddlewareRequest,
      response: MiddlewareResponse,
      next: () => void,
    ) => {
      if (hasUnsafeJsonShape(request.body)) {
        response.status(HttpStatus.BAD_REQUEST).json({
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          path: request.originalUrl ?? request.url ?? "/",
          statusCode: HttpStatus.BAD_REQUEST,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      next();
    },
  );
  app.use(cookieParser());

  app.setGlobalPrefix("api", {
    exclude: ["health", "ready"].map((path) => ({ path, method: RequestMethod.GET })),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}

function hasUnsafeJsonShape(value: unknown, depth = 0): boolean {
  if (value === null || typeof value !== "object") return false;
  if (depth > MAX_JSON_DEPTH) return true;

  for (const key of Object.keys(value)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) return true;
    if (
      hasUnsafeJsonShape((value as Record<string, unknown>)[key], depth + 1)
    ) {
      return true;
    }
  }
  return false;
}
