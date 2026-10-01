export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.OTEL_ENABLED !== "true"
  ) {
    return;
  }

  const { registerWebObservability } = await import(
    "./lib/observability/register"
  );
  registerWebObservability();
}

export async function onRequestError(
  error: unknown,
  _request: unknown,
  context: { routePath?: string },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { webLogger } = await import("./lib/observability/server-logger");
  webLogger.error("web.request.failed", {
    errorType: error instanceof Error ? error.name : "unknown",
    route: safeInstrumentationRoute(context.routePath),
  });
}

export function safeInstrumentationRoute(route: string | undefined): string {
  return route?.startsWith("/") && !route.includes("?")
    ? route
    : "__unmatched__";
}
