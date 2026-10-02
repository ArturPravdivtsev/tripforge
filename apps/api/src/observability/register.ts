import type { IncomingMessage } from "node:http";

import { ParentBasedSampler, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { AwsInstrumentation } from "@opentelemetry/instrumentation-aws-sdk";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  AggregationType,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";

import {
  readObservabilityConfig,
  type TripForgeServiceName,
} from "./observability-config";
import {
  getTelemetrySdk,
  setRuntimeServiceName,
  setTelemetrySdk,
} from "./observability-runtime";
import {
  DURATION_BUCKETS_SECONDS,
  METRIC_NAMES,
} from "./metrics.constants";

export function registerObservability(serviceName: TripForgeServiceName): void {
  setRuntimeServiceName(serviceName);
  const config = readObservabilityConfig(serviceName);
  if (!config.enabled || getTelemetrySdk()) return;

  const sdk = new NodeSDK({
    instrumentations: [
      createHttpInstrumentation(),
      new ExpressInstrumentation(),
      new PgInstrumentation({
        addSqlCommenterCommentToQueries: false,
        enableTraceContextPropagation: false,
        enhancedDatabaseReporting: false,
      }),
      new AwsInstrumentation({ suppressInternalInstrumentation: true }),
      new RuntimeNodeInstrumentation({ monitoringPrecision: 10_000 }),
    ],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          timeoutMillis: config.exportTimeoutMs,
          url: `${config.otlpEndpoint}/v1/metrics`,
        }),
        exportIntervalMillis: config.exportIntervalMs,
        exportTimeoutMillis: config.exportTimeoutMs,
      }),
    ],
    resource: resourceFromAttributes({
      "deployment.environment": config.environment,
      "deployment.environment.name": config.environment,
      "service.instance.id": config.instanceId,
      "service.name": config.serviceName,
      "service.version": config.serviceVersion,
    }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(config.samplingRatio),
    }),
    traceExporter: new OTLPTraceExporter({
      timeoutMillis: config.exportTimeoutMs,
      url: `${config.otlpEndpoint}/v1/traces`,
    }),
    views: [
      METRIC_NAMES.aiDuration,
      METRIC_NAMES.httpDuration,
      METRIC_NAMES.providerDuration,
      METRIC_NAMES.workerDuration,
    ].map((instrumentName) => ({
      aggregation: {
        options: { boundaries: [...DURATION_BUCKETS_SECONDS] },
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
      },
      instrumentName,
    })),
  });

  sdk.start();
  setTelemetrySdk(sdk);
  registerBoundedShutdown(sdk, config.exportTimeoutMs);
}

export function createHttpInstrumentation(): HttpInstrumentation {
  return new HttpInstrumentation({
    applyCustomAttributesOnSpan: (span, request) => {
      if (!isIncomingMessage(request)) return;
      const route = safeTelemetryRoute(request);
      const method = request.method?.toUpperCase() ?? "UNKNOWN";
      span.setAttribute("http.route", route);
      span.setAttribute("http.target", route);
      span.setAttribute("url.full", route);
      span.setAttribute("url.path", route);
      span.setAttribute("url.query", "__omitted__");
      span.updateName(`${method} ${route}`);
    },
    requestHook: (span, request) => {
      if (!isIncomingMessage(request)) return;
      span.setAttribute("client.address", "__omitted__");
      span.setAttribute("http.target", "__pending_route__");
      span.setAttribute("network.peer.address", "__omitted__");
      span.setAttribute("network.peer.port", 0);
      span.setAttribute("url.full", "__pending_route__");
      span.setAttribute("url.path", "__pending_route__");
      span.setAttribute("url.query", "__omitted__");
    },
  });
}

function registerBoundedShutdown(sdk: NodeSDK, timeoutMs: number): void {
  let shutdown: Promise<void> | undefined;
  const flush = () => {
    shutdown ??= Promise.race([
      sdk.shutdown(),
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, timeoutMs);
        timer.unref();
      }),
    ]).catch(() => undefined);
    return shutdown;
  };
  process.once("SIGINT", () => void flush());
  process.once("SIGTERM", () => void flush());
}

function isIncomingMessage(value: unknown): value is IncomingMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      "headers" in value &&
      "method" in value,
  );
}

export function safeTelemetryRoute(request: IncomingMessage): string {
  const expressRequest = request as IncomingMessage & {
    baseUrl?: string;
    route?: { path?: unknown };
  };
  const route = expressRequest.route?.path;
  if (typeof route !== "string" || !route.startsWith("/")) {
    return "__unmatched__";
  }
  const base = expressRequest.baseUrl?.replace(/\/$/u, "") ?? "";
  return `${base}${route}`.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu,
    ":id",
  );
}
