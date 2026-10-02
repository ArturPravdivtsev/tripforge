import { config } from "zod/v4/core";

// Set before schemas are constructed: even Zod's caught eval capability probe
// emits securitypolicyviolation under our nonce-based production CSP.
config({ jitless: true });
