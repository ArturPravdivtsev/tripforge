import { registerOTel } from "@vercel/otel";

export function registerWebObservability(): void {
  registerOTel({
    attributes: {
      "deployment.environment": process.env.NODE_ENV ?? "development",
      "deployment.environment.name": process.env.NODE_ENV ?? "development",
      "service.instance.id":
        process.env.OTEL_SERVICE_INSTANCE_ID ??
        `${process.env.HOSTNAME ?? "local"}:${process.pid}`,
      "service.version": process.env.TRIPFORGE_VERSION ?? "0.0.0",
    },
    serviceName: "tripforge-web",
    traceSampler: "parentbased_traceidratio",
  });
}
