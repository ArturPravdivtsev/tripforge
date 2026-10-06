// @vitest-environment node
import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getApiBaseUrl } from "./config";
import { getProxyConfiguration, proxyApiRequest, proxyRequestHeaders, upstreamUrl } from "./proxy";

const WEB = "https://web.example";
let upstream: string;
let server: Server;
let observed: { url?: string; method?: string; body: string; headers: Record<string, unknown> };

beforeAll(async () => {
  server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    observed = { body, headers: request.headers, method: request.method, url: request.url };
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Request-ID", "proxy-test");
    response.setHeader("Set-Cookie", [
      "__Host-tripforge_session=opaque; Path=/; HttpOnly; Secure; SameSite=Lax",
      "other=opaque; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
    response.setHeader("Connection", "keep-alive, x-hop-response");
    response.setHeader("X-Hop-Response", "removed");
    if (request.url === "/api/compressed") {
      const compressed = gzipSync("streamed response");
      response.writeHead(200, { "Content-Encoding": "gzip", "Content-Length": compressed.length });
      response.end(compressed);
    } else if (request.url === "/api/redirect") {
      response.writeHead(302, { Location: "https://untrusted.example/api" });
      response.end();
    } else if (request.method === "DELETE") {
      response.writeHead(204);
      response.end();
    } else {
      response.writeHead(422, { "Content-Type": "application/json" });
      response.write('{"code":');
      response.end('"EXPECTED_TEST_ERROR"}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing upstream test listener");
  upstream = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function configured() {
  vi.stubEnv("API_ORIGIN", upstream);
  vi.stubEnv("WEB_ORIGIN", WEB);
}

describe("same-origin API proxy", () => {
  it("does not use a public API origin for browser requests", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://untrusted.example");
    expect(getApiBaseUrl()).toBe("");
  });

  it("streams method/path/query/body and preserves auth context, status, headers and multiple cookies", async () => {
    configured();
    const response = await proxyApiRequest(new Request(`${WEB}/api/auth/register?return=%2Ftrips&host=evil.example`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", Cookie: "opaque-session", Authorization: "Bearer opaque",
        Origin: WEB, "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty",
        "X-TripForge-Request": "1", "X-Forwarded-Host": "evil.example", "X-Forwarded-Proto": "http",
        Forwarded: "host=evil.example", Connection: "keep-alive, x-hop", "X-Hop": "removed",
        "Proxy-Authorization": "removed", TE: "trailers", "Keep-Alive": "timeout=5",
      },
      body: '{"email":"proxy@example.com"}',
    }));
    expect(observed).toMatchObject({
      method: "POST", url: "/api/auth/register?return=%2Ftrips&host=evil.example",
      body: '{"email":"proxy@example.com"}',
      headers: {
        host: new URL(upstream).host, cookie: "opaque-session", authorization: "Bearer opaque", origin: WEB,
        "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty",
        "x-forwarded-host": "web.example", "x-forwarded-proto": "https", "x-tripforge-request": "1",
      },
    });
    for (const header of ["x-hop", "proxy-authorization", "te", "keep-alive", "forwarded"]) {
      expect(observed.headers).not.toHaveProperty(header);
    }
    expect(response.status).toBe(422);
    expect(await response.text()).toBe('{"code":"EXPECTED_TEST_ERROR"}');
    expect(response.headers.get("x-request-id")).toBe("proxy-test");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.getSetCookie()[0]).toContain("HttpOnly; Secure; SameSite=Lax");
    for (const header of ["connection", "x-hop-response", "transfer-encoding", "keep-alive"]) {
      expect(response.headers.has(header)).toBe(false);
    }
  });

  it("preserves invalid browser context so the upstream guard can reject it", () => {
    const headers = proxyRequestHeaders(new Request(`${WEB}/api/auth/logout`, {
      headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site", "X-TripForge-Request": "1" },
    }), { apiOrigin: upstream, webOrigin: WEB });
    expect(headers.get("origin")).toBe("https://evil.example");
    expect(headers.get("sec-fetch-site")).toBe("cross-site");
  });

  it("cannot select an arbitrary upstream through path, query or headers", () => {
    const config = { apiOrigin: upstream, webOrigin: WEB };
    const request = new Request(`${WEB}/api//evil.example/items?upstream=https://evil.example`, {
      headers: { "X-Forwarded-Host": "evil.example" },
    });
    expect(upstreamUrl(request, config).origin).toBe(upstream);
    expect(upstreamUrl(request, config).pathname).toBe("/api//evil.example/items");
    expect(() => upstreamUrl(new Request(`${WEB}/other`), config)).toThrow("Invalid proxy path");
    expect(() => proxyRequestHeaders(new Request(`${WEB}/api`, { headers: { Host: "evil.example" } }), config)).toThrow("Untrusted request host");
  });

  it.each([undefined, "", "https:", "https://*.example", "https://user:password@api.example", "https://api.example/path", "https://api.example?target=evil", WEB])(
    "fails closed for malformed or recursive upstream %s", async (value) => {
      configured();
      vi.stubEnv("API_ORIGIN", value);
      expect(() => getProxyConfiguration()).toThrow();
      const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
      expect((await proxyApiRequest(new Request(`${WEB}/api/auth/me`))).status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("fails closed without a trusted production web origin", () => {
    configured(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("WEB_ORIGIN", undefined);
    expect(() => getProxyConfiguration()).toThrow("WEB_ORIGIN");
  });

  it("returns HEAD/204 without a body and decodes compressed responses correctly", async () => {
    configured();
    const head = await proxyApiRequest(new Request(`${WEB}/api/items`, { method: "HEAD" }));
    expect(head.status).toBe(422); expect(head.body).toBeNull();
    const deleted = await proxyApiRequest(new Request(`${WEB}/api/items`, { method: "DELETE" }));
    expect(deleted.status).toBe(204); expect(deleted.body).toBeNull();
    const response = await proxyApiRequest(new Request(`${WEB}/api/compressed`));
    expect(await response.text()).toBe("streamed response");
    expect(response.headers.has("content-encoding")).toBe(false);
    expect(response.headers.has("content-length")).toBe(false);
  });

  it("does not follow upstream redirects to a client-selected host", async () => {
    configured();
    const response = await proxyApiRequest(new Request(`${WEB}/api/redirect`));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://untrusted.example/api");
  });

  it("preserves cookie and trusted origin for WebSocket handshakes and rejects other origins", () => {
    const config = { apiOrigin: upstream, webOrigin: WEB };
    const request = new Request(`${WEB}/socket.io/?EIO=4&transport=websocket`, {
      headers: { Origin: WEB, Cookie: "opaque-session", Upgrade: "websocket", Connection: "Upgrade" },
    });
    const headers = proxyRequestHeaders(request, config, true);
    expect(headers.get("cookie")).toBe("opaque-session");
    expect(headers.get("origin")).toBe(WEB);
    expect(headers.get("upgrade")).toBe("websocket");
    expect(upstreamUrl(request, config, true).search).toBe("?EIO=4&transport=websocket");
    expect(upstreamUrl(new Request(`${WEB}/socket.io?EIO=4&transport=websocket`), config, true).pathname).toBe("/socket.io/");
    expect(() => proxyRequestHeaders(new Request(`${WEB}/socket.io`, { headers: { Origin: "https://evil.example" } }), config, true)).toThrow();
  });
});
