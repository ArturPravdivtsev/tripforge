import pino from "pino";

const level = validLevel(process.env.LOG_LEVEL)
  ? process.env.LOG_LEVEL
  : process.env.NODE_ENV === "development"
    ? "debug"
    : "info";

const logger = pino({
  base: {
    environment: process.env.NODE_ENV ?? "development",
    service: "tripforge-web",
    version: process.env.TRIPFORGE_VERSION ?? "0.0.0",
  },
  formatters: { level: (label) => ({ level: label }) },
  level,
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
    ],
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const webLogger = {
  error(event: string, fields: Readonly<Record<string, unknown>>): void {
    logger.error({ event, ...fields });
  },
};

function validLevel(
  value: string | undefined,
): value is "debug" | "error" | "fatal" | "info" | "trace" | "warn" {
  return ["debug", "error", "fatal", "info", "trace", "warn"].includes(
    value ?? "",
  );
}
