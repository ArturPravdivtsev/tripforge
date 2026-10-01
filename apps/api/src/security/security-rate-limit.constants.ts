export const SECURITY_RATE_LIMIT_POLICY = "tripforge:security-rate-limit-policy";

export type SecurityRateLimitPolicyName =
  | "documentDownload"
  | "documentUpload"
  | "login"
  | "register"
  | "routeCalculation"
  | "tripSearch";

export type SecurityRateLimitPolicy = Readonly<{
  blockDurationMs: number;
  limit: number;
  tracker: "account" | "ip" | "user";
  windowMs: number;
}>;

export const SECURITY_RATE_LIMITS: Readonly<
  Record<SecurityRateLimitPolicyName, readonly SecurityRateLimitPolicy[]>
> = {
  documentDownload: [
    {
      blockDurationMs: 60_000,
      limit: 60,
      tracker: "user",
      windowMs: 60 * 60_000,
    },
  ],
  documentUpload: [
    {
      blockDurationMs: 5 * 60_000,
      limit: 20,
      tracker: "user",
      windowMs: 60 * 60_000,
    },
  ],
  login: [
    {
      blockDurationMs: 5 * 60_000,
      limit: 20,
      tracker: "ip",
      windowMs: 5 * 60_000,
    },
    {
      blockDurationMs: 15 * 60_000,
      limit: 10,
      tracker: "account",
      windowMs: 15 * 60_000,
    },
  ],
  register: [
    {
      blockDurationMs: 15 * 60_000,
      limit: 5,
      tracker: "ip",
      windowMs: 15 * 60_000,
    },
  ],
  routeCalculation: [
    {
      blockDurationMs: 60_000,
      limit: 10,
      tracker: "user",
      windowMs: 60_000,
    },
  ],
  tripSearch: [
    {
      blockDurationMs: 60_000,
      limit: 60,
      tracker: "user",
      windowMs: 60_000,
    },
  ],
};
