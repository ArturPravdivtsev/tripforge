import { Injectable } from "@nestjs/common";
import { metrics, type Meter } from "@opentelemetry/api";
import type { Pool } from "pg";

import { METRIC_NAMES } from "./metrics.constants";

export { METRIC_NAMES } from "./metrics.constants";

export class TripForgeMetrics {
  private readonly aiDuration;
  private readonly aiProposals;
  private readonly aiTokenCounter;
  private readonly aiToolCalls;
  private readonly aiTurns;
  private readonly authOutcomes;
  private readonly dbPoolConnections;
  private readonly dbPoolWaitingRequests;
  private readonly httpDuration;
  private readonly httpInFlight;
  private readonly httpRequests;
  private readonly outboxIncomplete;
  private readonly outboxOldestAge;
  private readonly providerDuration;
  private readonly providerRequests;
  private readonly rateLimitRejections;
  private readonly realtimeActiveJoins;
  private readonly realtimeActiveSockets;
  private readonly realtimeEvents;
  private readonly workerDuration;
  private readonly workerJobs;
  private outboxSnapshot = { incomplete: 0, oldestAgeSeconds: 0 };
  private pool?: Pool;

  constructor(meter: Meter) {
    this.aiDuration = meter.createHistogram(METRIC_NAMES.aiDuration, { unit: "s" });
    this.aiProposals = meter.createCounter(METRIC_NAMES.aiProposals, { unit: "{proposal}" });
    this.aiTokenCounter = meter.createCounter(METRIC_NAMES.aiTokens, { unit: "{token}" });
    this.aiToolCalls = meter.createCounter(METRIC_NAMES.aiToolCalls, { unit: "{call}" });
    this.aiTurns = meter.createCounter(METRIC_NAMES.aiTurns, { unit: "{turn}" });
    this.authOutcomes = meter.createCounter(METRIC_NAMES.authOutcomes);
    this.dbPoolConnections = meter.createObservableGauge(
      METRIC_NAMES.dbPoolConnections,
      { unit: "{connection}" },
    );
    this.dbPoolWaitingRequests = meter.createObservableGauge(
      METRIC_NAMES.dbPoolWaitingRequests,
      { unit: "{request}" },
    );
    this.httpDuration = meter.createHistogram(METRIC_NAMES.httpDuration, {
      unit: "s",
    });
    this.httpInFlight = meter.createUpDownCounter(METRIC_NAMES.httpInFlight, {
      unit: "{request}",
    });
    this.httpRequests = meter.createCounter(METRIC_NAMES.httpRequests, {
      unit: "{request}",
    });
    this.outboxIncomplete = meter.createObservableGauge(
      METRIC_NAMES.outboxIncomplete,
      { unit: "{item}" },
    );
    this.outboxOldestAge = meter.createObservableGauge(
      METRIC_NAMES.outboxOldestAge,
      { unit: "s" },
    );
    this.providerDuration = meter.createHistogram(METRIC_NAMES.providerDuration, {
      unit: "s",
    });
    this.providerRequests = meter.createCounter(METRIC_NAMES.providerRequests, {
      unit: "{request}",
    });
    this.rateLimitRejections = meter.createCounter(
      METRIC_NAMES.rateLimitRejections,
      { unit: "{rejection}" },
    );
    this.realtimeActiveJoins = meter.createUpDownCounter(
      METRIC_NAMES.realtimeActiveJoins,
      { unit: "{join}" },
    );
    this.realtimeActiveSockets = meter.createUpDownCounter(
      METRIC_NAMES.realtimeActiveSockets,
      { unit: "{socket}" },
    );
    this.realtimeEvents = meter.createCounter(METRIC_NAMES.realtimeEvents, {
      unit: "{event}",
    });
    this.workerDuration = meter.createHistogram(METRIC_NAMES.workerDuration, {
      unit: "s",
    });
    this.workerJobs = meter.createCounter(METRIC_NAMES.workerJobs, {
      unit: "{job}",
    });

    this.dbPoolConnections.addCallback((result) => {
      if (!this.pool) return;
      result.observe(this.pool.totalCount, { state: "total" });
      result.observe(this.pool.idleCount, { state: "idle" });
    });
    this.dbPoolWaitingRequests.addCallback((result) => {
      if (this.pool) result.observe(this.pool.waitingCount);
    });
    this.outboxIncomplete.addCallback((result) => {
      result.observe(this.outboxSnapshot.incomplete);
    });
    this.outboxOldestAge.addCallback((result) => {
      result.observe(this.outboxSnapshot.oldestAgeSeconds);
    });
  }

  auth(outcome: "login_failure" | "login_success" | "registration_success"): void {
    this.authOutcomes.add(1, { outcome });
  }

  aiTurn(model: string, outcome: string, durationSeconds: number): void {
    const attributes = { model, outcome };
    this.aiTurns.add(1, attributes);
    this.aiDuration.record(durationSeconds, attributes);
  }

  aiTool(toolName: string, outcome: "failure" | "success"): void {
    this.aiToolCalls.add(1, { outcome, tool_name: toolName });
  }

  aiProposal(
    proposalType: string,
    outcome: "applied" | "dismissed" | "generated",
  ): void {
    this.aiProposals.add(1, { outcome, proposal_type: proposalType });
  }

  aiTokens(
    model: string,
    usage: Readonly<{
      cachedInputTokens: number;
      inputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
    }>,
  ): void {
    this.aiTokenCounter.add(usage.inputTokens, { kind: "input", model });
    this.aiTokenCounter.add(usage.cachedInputTokens, { kind: "cached_input", model });
    this.aiTokenCounter.add(usage.outputTokens, { kind: "output", model });
    this.aiTokenCounter.add(usage.reasoningTokens, { kind: "reasoning", model });
  }

  httpStart(method: string): void {
    this.httpInFlight.add(1, { method });
  }

  httpComplete(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const attributes = {
      method,
      route,
      status_code: String(statusCode),
      status_class: `${Math.floor(statusCode / 100)}xx`,
    };
    this.httpInFlight.add(-1, { method });
    this.httpRequests.add(1, attributes);
    this.httpDuration.record(durationSeconds, attributes);
  }

  rateLimitRejected(limiter: string): void {
    this.rateLimitRejections.add(1, { limiter });
  }

  realtimeSocket(delta: 1 | -1, event: "connected" | "disconnected"): void {
    this.realtimeActiveSockets.add(delta);
    this.realtimeEvents.add(1, { event });
  }

  realtimeJoin(delta: 1 | -1): void {
    this.realtimeActiveJoins.add(delta);
  }

  realtimeEvent(
    event: "connection_rejected" | "join_rejected" | "publisher_failure",
  ): void {
    this.realtimeEvents.add(1, { event });
  }

  workerJob(
    jobName: string,
    outcome: "failed" | "retried" | "succeeded",
    durationSeconds: number,
  ): void {
    const attributes = { job_name: jobName, outcome };
    this.workerJobs.add(1, attributes);
    this.workerDuration.record(durationSeconds, attributes);
  }

  updateOutbox(incomplete: number, oldestAgeSeconds: number): void {
    this.outboxSnapshot = { incomplete, oldestAgeSeconds };
  }

  registerPool(pool: Pool): void {
    this.pool = pool;
  }

  providerRequest(
    mode: "cycling" | "driving" | "walking",
    outcome: "failure" | "success",
    durationSeconds: number,
  ): void {
    const attributes = {
      mode,
      operation: "directions",
      outcome,
      provider: "openrouteservice",
    };
    this.providerRequests.add(1, attributes);
    this.providerDuration.record(durationSeconds, attributes);
  }
}

@Injectable()
export class ObservabilityMetrics extends TripForgeMetrics {
  constructor() {
    super(metrics.getMeter("tripforge", "0.0.0"));
  }
}
