import type { AuthUser } from "@tripforge/contracts";

export type AuthenticatedUser = AuthUser;

export type AuthenticatedRequest = {
  authenticatedUser?: AuthenticatedUser;
  cookies?: Record<string, unknown>;
};
