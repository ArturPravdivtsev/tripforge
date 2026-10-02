import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { observeRedisPublicationFailures, TripForgeIoAdapter } from "./tripforge-io.adapter";

afterEach(() => vi.useRealTimers());

describe("ignored upstream ephemeral publication failures", () => {
  it("observes ignored rejection without changing caller semantics or logging payload", async () => {
    const failed = Promise.reject(new Error("private provider error"));
    const client = { publish: vi.fn().mockReturnValue(failed) };
    const onFailure = vi.fn();
    observeRedisPublicationFailures(client, onFailure);
    const returned = client.publish("private-channel", "private-payload");
    expect(returned).toBe(failed);
    await expect(returned).rejects.toThrow("private provider error");
    expect(onFailure).toHaveBeenCalledExactlyOnceWith();
  });

  it("preserves successful publication acknowledgements", async () => {
    const client = { publish: vi.fn().mockResolvedValue(2) };
    const onFailure = vi.fn();
    observeRedisPublicationFailures(client, onFailure);
    await expect(client.publish("channel", "payload")).resolves.toBe(2);
    expect(onFailure).not.toHaveBeenCalled();
  });
});

describe("bounded realtime Redis shutdown", () => {
  function subject(status = "ready") {
    const client = { status, quit: vi.fn().mockResolvedValue("OK"), disconnect: vi.fn() };
    const logger = { event: vi.fn() };
    const adapter = new TripForgeIoAdapter({} as never, new ConfigService(), logger as never);
    Object.assign(adapter, { redisClient: client });
    const server = { close: vi.fn((done: () => void) => done()) };
    return { adapter, client, logger, server };
  }

  it("closes sockets before draining queued Redis publications", async () => {
    const { adapter, client, server } = subject();
    await adapter.close(server as never);
    expect(server.close).toHaveBeenCalledOnce();
    expect(client.quit).toHaveBeenCalledOnce();
    expect(server.close.mock.invocationCallOrder[0]).toBeLessThan(client.quit.mock.invocationCallOrder[0]!);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("forces close after a two-second deadline without a hanging shutdown", async () => {
    vi.useFakeTimers();
    const { adapter, client, logger, server } = subject();
    client.quit.mockReturnValue(new Promise(() => undefined));
    const closed = adapter.close(server as never);
    await vi.advanceTimersByTimeAsync(2_000);
    await closed;
    expect(client.disconnect).toHaveBeenCalledOnce();
    expect(logger.event).toHaveBeenCalledWith("warn", "realtime.redis.shutdown_forced");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles a rejected quit without an unhandled rejection", async () => {
    const { adapter, client, server } = subject();
    client.quit.mockRejectedValue(new Error("Connection is closed."));
    await expect(adapter.close(server as never)).resolves.toBeUndefined();
    expect(client.disconnect).toHaveBeenCalledOnce();
  });

  it.each(["reconnecting", "end"])("does not queue quit while %s", async (status) => {
    const { adapter, client, server } = subject(status);
    await adapter.close(server as never);
    expect(client.quit).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledTimes(status === "end" ? 0 : 1);
  });
});
