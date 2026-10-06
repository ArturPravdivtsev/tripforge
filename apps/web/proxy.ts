import { randomBytes } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { getProxyConfiguration, proxyRequestHeaders, upstreamUrl } from "./lib/api/proxy";
import { buildContentSecurityPolicy } from "./lib/security/content-security-policy";

export function proxy(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname === "/socket.io" || request.nextUrl.pathname.startsWith("/socket.io/")) {
    try {
      const configuration = getProxyConfiguration();
      const headers = proxyRequestHeaders(request, configuration, true);
      return NextResponse.rewrite(upstreamUrl(request, configuration, true), { request: { headers } });
    } catch {
      return new NextResponse(null, { status: 403 });
    }
  }
  const nonce = randomBytes(16).toString("base64");
  const policy = buildContentSecurityPolicy({
    development: process.env.NODE_ENV === "development",
    nonce,
    s3UploadOrigin: process.env.S3_UPLOAD_ORIGIN?.trim() || undefined,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", policy);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
    },
  ],
};
