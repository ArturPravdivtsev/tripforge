export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export type AuthenticatedRequest = {
  authenticatedUser?: AuthenticatedUser;
  cookies?: Record<string, unknown>;
};
