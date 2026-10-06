const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
]);

export type ProxyConfiguration = Readonly<{
  apiOrigin: string;
  webOrigin: string;
}>;

export function getProxyConfiguration(): ProxyConfiguration {
  const apiOrigin = exactOrigin(
    process.env.API_ORIGIN ?? (process.env.NODE_ENV === "development" ? "http://127.0.0.1:4000" : undefined),
    "API_ORIGIN",
  );
  const webOrigin = exactOrigin(
    process.env.WEB_ORIGIN ?? (process.env.NODE_ENV === "development" ? "http://127.0.0.1:3000" : undefined),
    "WEB_ORIGIN",
  );
  if (apiOrigin === webOrigin) throw new Error("API_ORIGIN must differ from WEB_ORIGIN");
  return { apiOrigin, webOrigin };
}

function exactOrigin(value: string | undefined, name: string): string {
  try {
    const url = new URL(value ?? "");
    if (!value || !["http:", "https:"].includes(url.protocol) || url.origin !== value || url.hostname.includes("*")) {
      throw new Error();
    }
    return value;
  } catch {
    throw new Error(`${name} must be an exact HTTP origin`);
  }
}

export function upstreamUrl(request: Request, configuration: ProxyConfiguration, socket = false): URL {
  const incoming = new URL(request.url);
  const prefix = socket ? "/socket.io" : "/api";
  if (incoming.pathname !== prefix && !incoming.pathname.startsWith(`${prefix}/`)) {
    throw new Error("Invalid proxy path");
  }
  // Assign fields, never resolve a client-supplied URL against the upstream.
  const target = new URL(configuration.apiOrigin);
  // Engine.IO expects its canonical slash, but the browser upgrade must use
  // /socket.io to avoid Next's HTTP-only trailing-slash redirect.
  target.pathname = socket && incoming.pathname === "/socket.io" ? "/socket.io/" : incoming.pathname;
  target.search = incoming.search;
  return target;
}

export function proxyRequestHeaders(request: Request, configuration: ProxyConfiguration, socket = false): Headers {
  const web = new URL(configuration.webOrigin);
  const host = request.headers.get("host") ?? new URL(request.url).host;
  if (host !== web.host) throw new Error("Untrusted request host");
  const headers = stripHopByHop(request.headers);
  // Preserve the actual browser Origin/Fetch Metadata. Never manufacture trusted
  // context for an invalid cross-site request; the API guard still rejects it.
  headers.delete("host");
  headers.delete("forwarded");
  for (const name of [...headers.keys()]) {
    if (name.startsWith("x-forwarded-") || name.startsWith("x-middleware-") || name === "x-nonce") headers.delete(name);
  }
  headers.set("x-forwarded-host", web.host);
  headers.set("x-forwarded-proto", web.protocol.slice(0, -1));
  if (socket) {
    if (request.method !== "GET" || request.headers.get("upgrade")?.toLowerCase() !== "websocket" || request.headers.get("origin") !== configuration.webOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new Error("Untrusted socket origin");
    }
    // A WebSocket handshake requires these transport headers on the new hop.
    headers.set("connection", "Upgrade");
    headers.set("upgrade", "websocket");
    headers.set("host", web.host);
  }
  return headers;
}

export function stripHopByHop(source: Headers): Headers {
  const headers = new Headers(source);
  for (const token of (source.get("connection") ?? "").split(",")) {
    if (token.trim()) headers.delete(token.trim());
  }
  for (const name of HOP_BY_HOP) headers.delete(name);
  return headers;
}

export async function proxyApiRequest(request: Request): Promise<Response> {
  let configuration: ProxyConfiguration;
  try {
    configuration = getProxyConfiguration();
  } catch {
    return proxyError(503, "API_PROXY_UNAVAILABLE");
  }
  let target: URL;
  let headers: Headers;
  try {
    target = upstreamUrl(request, configuration);
    headers = proxyRequestHeaders(request, configuration);
  } catch {
    return proxyError(403, "API_PROXY_REJECTED");
  }
  try {
    const options: RequestInit & { duplex?: "half" } = {
      cache: "no-store",
      headers,
      method: request.method,
      // Node fetch generates the upstream hop's Sec-Fetch-Mode as cors. The
      // actual browser Origin/Site/Dest and mutation marker remain unchanged.
      mode: "cors",
      redirect: "manual",
      signal: request.signal,
    };
    if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
      options.body = request.body;
      options.duplex = "half";
    }
    const response = await fetch(target, options);
    const responseHeaders = stripHopByHop(response.headers);
    // fetch decodes upstream compression; don't describe decoded bytes as gzip.
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.delete("set-cookie");
    for (const cookie of response.headers.getSetCookie()) responseHeaders.append("set-cookie", cookie);
    const noBody = request.method === "HEAD" || [204, 205, 304].includes(response.status);
    return new Response(noBody ? null : response.body, {
      headers: responseHeaders,
      status: response.status,
      statusText: response.statusText,
    });
  } catch {
    return proxyError(502, "API_PROXY_UNAVAILABLE");
  }
}

function proxyError(status: number, code: string): Response {
  return Response.json({ code, message: "API request could not be proxied", statusCode: status }, {
    headers: { "Cache-Control": "private, no-store" }, status,
  });
}
