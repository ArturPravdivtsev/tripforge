import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from "@tripforge/contracts";

import { apiFetch } from "./client";

export const authApi = {
  login(input: LoginRequest): Promise<AuthResponse> {
    return apiFetch("/api/auth/login", { json: input, method: "POST" });
  },

  logout(): Promise<void> {
    return apiFetch("/api/auth/logout", { method: "POST" });
  },

  me(): Promise<AuthResponse> {
    return apiFetch("/api/auth/me");
  },

  register(input: RegisterRequest): Promise<AuthResponse> {
    return apiFetch("/api/auth/register", { json: input, method: "POST" });
  },
};
