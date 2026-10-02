export const METRIC_NAMES = {
  aiDuration: "tripforge.ai.duration",
  aiProposals: "tripforge.ai.proposals",
  aiTokens: "tripforge.ai.tokens",
  aiToolCalls: "tripforge.ai.tool_calls",
  aiTurns: "tripforge.ai.turns",
  authOutcomes: "tripforge.auth.outcomes",
  dbPoolConnections: "tripforge.db.pool.connections",
  dbPoolWaitingRequests: "tripforge.db.pool.waiting_requests",
  httpDuration: "tripforge.http.server.duration",
  httpInFlight: "tripforge.http.server.in_flight",
  httpRequests: "tripforge.http.server.requests",
  outboxIncomplete: "tripforge.storage.outbox.incomplete",
  outboxOldestAge: "tripforge.storage.outbox.oldest_age",
  providerDuration: "tripforge.external.provider.duration",
  providerRequests: "tripforge.external.provider.requests",
  rateLimitRejections: "tripforge.security.rate_limit.rejections",
  realtimeActiveJoins: "tripforge.realtime.active_joins",
  realtimeActiveSockets: "tripforge.realtime.active_sockets",
  realtimeEvents: "tripforge.realtime.events",
  workerDuration: "tripforge.worker.job.duration",
  workerJobs: "tripforge.worker.jobs",
} as const;

export const DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15, 30, 45,
] as const;
