import { Controller, Get, Res } from "@nestjs/common";

import { ReadinessService } from "./readiness.service";

type ProbeResponse = {
  status(code: number): ProbeResponse;
  json(body: { status: "ready" | "not_ready" }): void;
};

@Controller("ready")
export class ReadyController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get()
  async getReady(@Res() response: ProbeResponse): Promise<void> {
    const ready = await this.readiness.check();
    response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
  }
}
