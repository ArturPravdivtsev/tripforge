import { Readable } from "node:stream";

import { AwsInstrumentation } from "@opentelemetry/instrumentation-aws-sdk";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { describe, expect, it } from "vitest";

describe("AWS SDK tracing", () => {
  it("exports a safe S3 operation span without credentials or signed URLs", async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    const instrumentation = new AwsInstrumentation();
    instrumentation.setTracerProvider(provider);
    instrumentation.enable();

    try {
      const { HeadBucketCommand, S3Client } = await import("@aws-sdk/client-s3");
      const client = new S3Client({
        credentials: {
          accessKeyId: "unit-test-access-key",
          secretAccessKey: "unit-test-secret-key",
        },
        region: "us-east-1",
        requestHandler: {
          destroy() {},
          handle: async () => ({
            response: {
              body: Readable.from([]),
              headers: {},
              statusCode: 200,
            },
          }),
        },
      });
      await client.send(new HeadBucketCommand({ Bucket: "tripforge-test" }));
      await provider.forceFlush();

      const exported = exporter.getFinishedSpans().map((span) => ({
        attributes: span.attributes,
        name: span.name,
      }));
      const serialized = JSON.stringify(exported);
      expect(serialized).toMatch(/S3|HeadBucket/iu);
      expect(serialized).not.toMatch(
        /unit-test-access-key|unit-test-secret-key|authorization|presigned|signature/iu,
      );
    } finally {
      instrumentation.disable();
      await provider.shutdown();
    }
  });
});
