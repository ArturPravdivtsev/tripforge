import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { AppLogger } from "./app-logger.service";
import { ObservabilityMetrics } from "./metrics.service";
import { requestContext } from "./request-context";

type RouteAwareRequest = IncomingMessage & {
  baseUrl?: string;
  route?: { path?: unknown };
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_SEGMENT_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu;
const SLOW_REQUEST_SECONDS = 1;

export function createHttpObservabilityMiddleware(
  logger: AppLogger,
  metrics: ObservabilityMetrics,
): (
  request: RouteAwareRequest,
  response: ServerResponse,
  next: () => void,
) => void {
  return (request, response, next) => {
    const requestId = validRequestId(request.headers["x-request-id"]);
    const method = request.method?.toUpperCase() ?? "UNKNOWN";
    const startedAt = process.hrtime.bigint();
    response.setHeader("X-Request-ID", requestId);
    metrics.httpStart(method);

    requestContext.run({ requestId }, () => {
      response.once("finish", () => {
        const durationSeconds =
          Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
        const route = routeTemplate(request);
        metrics.httpComplete(method, route, response.statusCode, durationSeconds);
        logger.event(
          durationSeconds > SLOW_REQUEST_SECONDS ? "warn" : "info",
          "http.request.completed",
          {
            durationMs: Number((durationSeconds * 1_000).toFixed(3)),
            method,
            route,
            statusCode: response.statusCode,
          },
        );
      });
      next();
    });
  };
}

export function routeTemplate(request: RouteAwareRequest): string {
  const path = request.route?.path;
  if (typeof path !== "string" || !path.startsWith("/")) {
    return "__unmatched__";
  }
  const base =
    request.baseUrl
      ?.replace(UUID_SEGMENT_PATTERN, ":id")
      .replace(/\/$/u, "") ?? "";
  return `${base}${path}`.replace(/\/{2,}/gu, "/") || "/";
}

export function validRequestId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? undefined : value;
  return candidate && UUID_PATTERN.test(candidate) ? candidate : randomUUID();
}
