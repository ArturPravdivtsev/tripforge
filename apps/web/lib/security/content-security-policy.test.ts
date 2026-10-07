import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "./content-security-policy";
import { getWebSecurityHeaders } from "./web-security-headers";

describe("production web security policy", () => {
  it("builds a nonce policy with only expected connection origins", () => {
    const policy = buildContentSecurityPolicy({
      development: false,
      nonce: "fixed-test-nonce",
      s3UploadOrigin: "https://uploads.tripforge.example",
    });

    expect(policy).toContain("default-src 'self';");
    expect(policy).toContain(
      "script-src 'self' 'nonce-fixed-test-nonce' 'strict-dynamic';",
    );
    expect(policy).toContain("object-src 'none';");
    expect(policy).toContain("frame-ancestors 'none';");
    expect(policy).toContain(
      "connect-src 'self' https://api.maptiler.com https://uploads.tripforge.example;",
    );
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toMatch(/default-src[^;]*\*/u);
    expect(policy).not.toMatch(/connect-src[^;]*\bhttps:\s/u);
    expect(policy).not.toMatch(/connect-src[^;]*\bwss:\s/u);
  });

  it("limits development relaxation to script evaluation", () => {
    const policy = buildContentSecurityPolicy({
      development: true,
      nonce: "development-nonce",
      s3UploadOrigin: "http://localhost:4566",
    });

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).not.toContain("127.0.0.1:4000");
    expect(policy).toContain("http://localhost:4566");
  });

  it("permits only the hosted storage URL origin, not its S3 path or credentials", () => {
    const origin = "https://escgigaitmycmhkcsjny.storage.supabase.co";
    const policy = buildContentSecurityPolicy({ development: false, nonce: "nonce", s3UploadOrigin: origin });
    expect(policy).toContain(`connect-src 'self' https://api.maptiler.com ${origin};`);
    expect(policy).not.toContain("/storage/v1/s3");
    expect(policy).not.toMatch(/AWS_|X-Amz-|\*/u);
    for (const s3UploadOrigin of [`${origin}/storage/v1/s3`, "https://*.supabase.co", "https://*.storage.supabase.co"]) {
      expect(() => buildContentSecurityPolicy({ development: false, nonce: "nonce", s3UploadOrigin }))
        .toThrow(/S3_UPLOAD_ORIGIN must be an exact HTTP origin/u);
    }
  });

  it("rejects broad or malformed configured origins", () => {
    for (const s3UploadOrigin of [
      "https:",
      "https://*.amazonaws.com",
      "https://user:password@uploads.example",
      "https://uploads.example/path",
      "https://uploads.example?bucket=documents",
    ]) {
      expect(() =>
        buildContentSecurityPolicy({
          development: false,
          nonce: "nonce",
          s3UploadOrigin,
        }),
      ).toThrow(/S3_UPLOAD_ORIGIN must be an exact HTTP origin/u);
    }

    const withoutUploadOrigin = buildContentSecurityPolicy({
      development: false,
      nonce: "nonce",
    });
    expect(withoutUploadOrigin).not.toContain("amazonaws.com");
    expect(withoutUploadOrigin).not.toMatch(/connect-src[^;]*\*/u);
  });

  it("sets defensive static headers and production-only HSTS", () => {
    const production = Object.fromEntries(
      getWebSecurityHeaders(true).map(({ key, value }) => [key, value]),
    );
    const development = Object.fromEntries(
      getWebSecurityHeaders(false).map(({ key, value }) => [key, value]),
    );

    expect(production).toMatchObject({
      "Permissions-Policy": expect.stringContaining("camera=()"),
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=31536000",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    expect(development).not.toHaveProperty("Strict-Transport-Security");
  });
});
