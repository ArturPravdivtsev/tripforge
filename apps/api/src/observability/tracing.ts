import {
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";

const tracer = trace.getTracer("tripforge-domain", "0.0.0");

export async function withInternalSpan<T>(
  name: string,
  attributes: Attributes,
  action: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(
    name,
    { attributes, kind: SpanKind.INTERNAL },
    async (span) => {
      try {
        const result = await action(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.name : "Error",
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

export async function withClientSpan<T>(
  name: string,
  attributes: Attributes,
  action: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(
    name,
    { attributes, kind: SpanKind.CLIENT },
    async (span) => {
      try {
        const result = await action(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.name : "Error",
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
