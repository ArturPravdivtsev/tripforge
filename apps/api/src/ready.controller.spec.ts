import { describe, expect, it, vi } from "vitest";

import { ReadyController } from "./ready.controller";
import type { ReadinessService } from "./readiness.service";

describe("readiness privacy", () => {
  it.each([true, false])("returns only bounded readiness status (%s)", async (ready) => {
    const json = vi.fn();
    const response = { json, status: vi.fn().mockReturnValue({ json }) };
    const controller = new ReadyController({ check: vi.fn().mockResolvedValue(ready) } as unknown as ReadinessService);
    await controller.getReady(response);
    expect(response.status).toHaveBeenCalledWith(ready ? 200 : 503);
    expect(json).toHaveBeenCalledWith({ status: ready ? "ready" : "not_ready" });
  });
});
