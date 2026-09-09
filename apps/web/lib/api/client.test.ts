import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./client";
import { ApiClientError } from "./errors";

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes credentials and adds the mutation header to POST requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1" } }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/auth/login", {
      json: { email: "user@example.com", password: "password" },
      method: "POST",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
    expect(new Headers(options.headers).get("X-TripForge-Request")).toBe("1");
    expect(new Headers(options.headers).get("Content-Type")).toBe(
      "application/json",
    );
  });

  it("does not add mutation-only headers to GET requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/auth/me");

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
    expect(new Headers(options.headers).has("X-TripForge-Request")).toBe(false);
    expect(new Headers(options.headers).has("Content-Type")).toBe(false);
  });

  it("decodes API error envelopes into a controlled error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
            path: "/api/auth/login",
            statusCode: 401,
            timestamp: new Date().toISOString(),
          }),
          { status: 401 },
        ),
      ),
    );

    const error = await apiFetch("/api/auth/login").catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
  });

  it("handles empty successful responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(
      apiFetch<void>("/api/auth/logout", { method: "POST" }),
    ).resolves.toBeUndefined();
  });
});
