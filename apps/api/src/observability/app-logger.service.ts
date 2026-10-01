import {
  Inject,
  Injectable,
  Optional,
  type LoggerService,
} from "@nestjs/common";
import { context, trace } from "@opentelemetry/api";
import pino, {
  type DestinationStream,
  type Logger as PinoLogger,
  type LoggerOptions,
} from "pino";

import { readObservabilityConfig } from "./observability-config";
import { getRuntimeServiceName } from "./observability-runtime";
import { requestContext } from "./request-context";

export type LogFields = Readonly<Record<string, unknown>>;

const SENSITIVE_KEY =
  /password|token|session|cookie|authorization|secret|api.?key|access.?key|presigned.?url/iu;
export const APP_LOG_DESTINATION = Symbol("APP_LOG_DESTINATION");

@Injectable()
export class AppLogger implements LoggerService {
  private readonly logger: PinoLogger;
  private readonly production: boolean;

  constructor(
    @Optional()
    @Inject(APP_LOG_DESTINATION)
    destination?: DestinationStream,
  ) {
    const config = readObservabilityConfig(getRuntimeServiceName());
    this.production = config.environment === "production";
    const options: LoggerOptions = {
      base: {
        environment: config.environment,
        service: config.serviceName,
        version: config.serviceVersion,
      },
      formatters: {
        level: (level) => ({ level }),
      },
      level: config.logLevel,
      messageKey: "message",
      redact: {
        censor: "[Redacted]",
        paths: [
          "password",
          "token",
          "session",
          "cookie",
          "authorization",
          "secret",
          "apiKey",
          "accessKey",
          "presignedUrl",
          "*.password",
          "*.token",
          "*.cookie",
          "*.authorization",
          "*.secret",
        ],
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    };
    this.logger = destination ? pino(options, destination) : pino(options);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", "nest.debug", message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", "nest.error", message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write("fatal", "nest.fatal", message, optionalParams);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write("info", "nest.log", message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write("trace", "nest.verbose", message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write("warn", "nest.warn", message, optionalParams);
  }

  event(
    level: "debug" | "error" | "info" | "warn",
    event: string,
    fields: LogFields = {},
    message?: string,
  ): void {
    this.logger[level](this.enrich(event, fields), message);
  }

  private enrich(event: string, fields: LogFields): Record<string, unknown> {
    const spanContext = trace.getSpan(context.active())?.spanContext();
    const correlation = requestContext.get();
    return {
      event,
      ...sanitizeLogFields(fields),
      ...(correlation ? { requestId: correlation.requestId } : {}),
      ...(spanContext?.traceId ? { traceId: spanContext.traceId } : {}),
      ...(spanContext?.spanId ? { spanId: spanContext.spanId } : {}),
    };
  }

  private write(
    level: "debug" | "error" | "fatal" | "info" | "trace" | "warn",
    event: string,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const text = typeof message === "string" ? message : "Nest event";
    let contextName: string | undefined;
    for (let index = optionalParams.length - 1; index >= 0; index -= 1) {
      const parameter = optionalParams[index];
      if (typeof parameter === "string") {
        contextName = parameter;
        break;
      }
    }
    const fields = contextName ? { nestContext: contextName } : {};
    this.logger[level](this.enrich(event, fields), text);

    if (!this.production && message instanceof Error && message.stack) {
      this.logger.debug(
        this.enrich("nest.error.stack", { errorType: message.name }),
        message.stack,
      );
    }
  }
}

export function sanitizeLogFields(
  fields: LogFields,
): Record<string, unknown> {
  return sanitizeRecord(fields, 0);
}

function sanitizeRecord(
  value: Readonly<Record<string, unknown>>,
  depth: number,
): Record<string, unknown> {
  if (depth > 4) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[Redacted]" : sanitizeValue(entry, depth + 1),
    ]),
  );
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || ["boolean", "number", "string"].includes(typeof value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  }
  if (value instanceof Error) return { errorType: value.name };
  if (typeof value === "object") {
    return sanitizeRecord(value as Record<string, unknown>, depth);
  }
  return String(value);
}
