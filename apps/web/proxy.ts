import { randomBytes } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { buildContentSecurityPolicy } from "./lib/security/content-security-policy";

export function proxy(request: NextRequest): NextResponse {
  const nonce = randomBytes(16).toString("base64");
  const policy = buildContentSecurityPolicy({
    apiOrigin: requiredEnvironment("NEXT_PUBLIC_API_URL"),
    development: process.env.NODE_ENV === "development",
    nonce,
    s3UploadOrigin: process.env.NEXT_PUBLIC_S3_UPLOAD_ORIGIN?.trim() || undefined,
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

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
