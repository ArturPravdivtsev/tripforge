import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BackgroundJobsService } from "../background-jobs/background-jobs.service";
import { JOB_NAMES } from "../background-jobs/background-jobs.constants";

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
trace.setGlobalTracerProvider(provider);

describe("worker job tracing", () => {
  const stalePending = { cleanup: vi.fn() };
  const metrics = { workerJob: vi.fn() };
  const service = new BackgroundJobsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    stalePending as never,
    {} as never,
    { event: vi.fn() } as never,
    metrics as never,
  );
  const job = {
    attemptsMade: 0,
    name: JOB_NAMES.cleanupStalePending,
    opts: { attempts: 2 },
  };

  beforeEach(() => {
    exporter.reset();
    vi.clearAllMocks();
  });
  afterAll(async () => provider.shutdown());

  it("exports success with fixed job attributes", async () => {
    stalePending.cleanup.mockResolvedValue(3);

    await expect(processJob(service, job)).resolves.toBe(3);
    expect(exporter.getFinishedSpans()).toEqual([
      expect.objectContaining({
        attributes: {
          "job.attempt": 1,
          "job.name": JOB_NAMES.cleanupStalePending,
          "job.outcome": "succeeded",
        },
        name: `worker ${JOB_NAMES.cleanupStalePending}`,
      }),
    ]);
    expect(metrics.workerJob).toHaveBeenCalledWith(
      JOB_NAMES.cleanupStalePending,
      "succeeded",
      expect.any(Number),
    );
  });

  it("marks retry spans as errors without adding job IDs", async () => {
    stalePending.cleanup.mockRejectedValue(new TypeError("provider detail"));

    await expect(processJob(service, job)).rejects.toBeInstanceOf(TypeError);
    const span = exporter.getFinishedSpans()[0];
    expect(span).toMatchObject({
      attributes: {
        "job.attempt": 1,
        "job.name": JOB_NAMES.cleanupStalePending,
        "job.outcome": "retried",
      },
      status: { code: 2, message: "TypeError" },
    });
    expect(JSON.stringify(span?.attributes)).not.toMatch(/job.?id|provider detail/iu);
  });
});

function processJob(
  service: BackgroundJobsService,
  job: Record<string, unknown>,
): Promise<unknown> {
  return (
    service as unknown as {
      process(input: Record<string, unknown>): Promise<unknown>;
    }
  ).process(job);
}
