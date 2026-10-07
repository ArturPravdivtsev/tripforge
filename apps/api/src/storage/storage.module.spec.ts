import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { S3Client } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateEnvironment } from "../config/environment";
import { S3_INTERNAL_CLIENT, S3_SIGNING_CLIENT } from "./storage.constants";
import { StorageModule } from "./storage.module";
import { S3StorageService } from "./s3-storage.service";

const endpoint = "https://escgigaitmycmhkcsjny.storage.supabase.co/storage/v1/s3";
const bucket = "tripforge-demo-documents";
const key = "trips/test/documents/test/opaque";
const modules: TestingModule[] = [];

async function storageFor(settings: Record<string, unknown>) {
  const config = new ConfigService(validateEnvironment({ NODE_ENV: "test", ...settings }));
  const module = await Test.createTestingModule({ imports: [StorageModule] })
    .useMocker((token) => token === ConfigService ? config : undefined)
    .compile();
  modules.push(module);
  return {
    internal: module.get<S3Client>(S3_INTERNAL_CLIENT),
    signing: module.get<S3Client>(S3_SIGNING_CLIENT),
    storage: module.get(S3StorageService),
  };
}

describe("provider-neutral S3 client compatibility (offline)", () => {
  beforeEach(() => {
    // Synthetic credentials only; real SDK signing must not consult a live role.
    vi.stubEnv("AWS_ACCESS_KEY_ID", "test");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "fake-storage-signing-secret");
    vi.stubEnv("AWS_SESSION_TOKEN", undefined);
    vi.stubEnv("AWS_ENDPOINT_URL", undefined);
    vi.stubEnv("AWS_ENDPOINT_URL_S3", undefined);
    vi.stubEnv("AWS_REQUEST_CHECKSUM_CALCULATION", "WHEN_SUPPORTED");
    vi.stubEnv("AWS_RESPONSE_CHECKSUM_VALIDATION", "WHEN_SUPPORTED");
    vi.stubEnv("S3_ENDPOINT", undefined);
    vi.stubEnv("S3_PUBLIC_ENDPOINT", undefined);
  });

  afterEach(async () => {
    for (const module of modules.splice(0)) await module.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("keeps native AWS endpoint resolution, addressing and checksum defaults", async () => {
    const { internal, signing, storage } = await storageFor({
      S3_BUCKET: "tripforge-production-documents-test",
      S3_REGION: "eu-west-1",
    });
    expect(internal.config.endpoint).toBeUndefined();
    expect(signing.config.endpoint).toBeUndefined();
    expect(signing.config.forcePathStyle).toBe(false);
    expect(await signing.config.requestChecksumCalculation()).toBe("WHEN_SUPPORTED");
    expect(await signing.config.responseChecksumValidation()).toBe("WHEN_SUPPORTED");
    const url = new URL((await storage.createDownloadUrl(key, "ticket.pdf")).url);
    expect(url.origin).toBe("https://tripforge-production-documents-test.s3.eu-west-1.amazonaws.com");
  });

  it("preserves split LocalStack endpoints and explicit path-style addressing", async () => {
    const { internal, signing, storage } = await storageFor({
      S3_ENDPOINT: "http://localstack:4566",
      S3_PUBLIC_ENDPOINT: "http://localhost:4566",
      S3_FORCE_PATH_STYLE: "true",
    });
    expect((await internal.config.endpoint!()).hostname).toBe("localstack");
    expect((await signing.config.endpoint!()).hostname).toBe("localhost");
    expect(internal.config.forcePathStyle).toBe(true);
    expect(await signing.config.requestChecksumCalculation()).toBe("WHEN_SUPPORTED");
    const url = new URL((await storage.createUploadUrl(key, "application/pdf")).url);
    expect(url.origin).toBe("http://localhost:4566");
    expect(url.pathname).toBe(`/tripforge-documents/${key}`);
  });

  it("presigns PUT and GET through a path-prefixed endpoint with bounded capabilities", async () => {
    vi.stubEnv("AWS_REQUEST_CHECKSUM_CALCULATION", "WHEN_REQUIRED");
    vi.stubEnv("AWS_RESPONSE_CHECKSUM_VALIDATION", "WHEN_REQUIRED");
    const { internal, signing, storage } = await storageFor({
      S3_BUCKET: bucket, S3_ENDPOINT: endpoint,
      S3_FORCE_PATH_STYLE: "true", S3_REGION: "eu-west-2",
    });
    expect(internal.config.forcePathStyle).toBe(true);
    expect(signing.config.forcePathStyle).toBe(true);
    expect(await internal.config.region()).toBe("eu-west-2");
    expect(await signing.config.requestChecksumCalculation()).toBe("WHEN_REQUIRED");
    const upload = await storage.createUploadUrl(key, "application/pdf");
    const download = await storage.createDownloadUrl(key, "ticket.pdf");
    for (const [signed, expiry] of [[upload, 600], [download, 300]] as const) {
      const url = new URL(signed.url);
      expect(url.origin).toBe(new URL(endpoint).origin);
      expect(url.pathname).toBe(`/storage/v1/s3/${bucket}/${key}`);
      expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
      expect(url.searchParams.get("X-Amz-Expires")).toBe(String(expiry));
      expect(url.searchParams.get("X-Amz-Credential")).toMatch(/\/eu-west-2\/s3\/aws4_request$/u);
      expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/u);
      expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
      expect([...url.searchParams.keys()].some(name => /checksum/iu.test(name))).toBe(false);
      expect(Object.keys(signed).sort()).toEqual(["expiresAt", "url"]);
      expect(signed.url).not.toContain("fake-storage-signing-secret");
      expect(Date.parse(signed.expiresAt) - Date.now()).toBeLessThanOrEqual(expiry * 1000);
      expect(Date.parse(signed.expiresAt) - Date.now()).toBeGreaterThan((expiry - 5) * 1000);
    }
    expect(new URL(download.url).searchParams.get("response-content-disposition"))
      .toBe('attachment; filename="ticket.pdf"');
    // SigV4 exposes a key identifier/scope, not the secret or a credential object.
    expect(new URL(upload.url).searchParams.has("AWS_SECRET_ACCESS_KEY")).toBe(false);
    expect(new URL(download.url).searchParams.has("AWS_SECRET_ACCESS_KEY")).toBe(false);
  });

  it("serializes HEAD and permanent DELETE with the configured bucket and endpoint", async () => {
    const { internal, storage } = await storageFor({
      S3_BUCKET: bucket, S3_ENDPOINT: endpoint,
      S3_FORCE_PATH_STYLE: "true", S3_REGION: "eu-west-2",
    });
    const handle = vi.spyOn(internal.config.requestHandler, "handle").mockImplementation(async request => ({
      response: {
        statusCode: request.method === "HEAD" ? 200 : 204,
        headers: { "content-length": "9", "content-type": "application/pdf", etag: '"test-etag"' },
        body: undefined,
      },
    }));
    expect(await storage.headObject(key)).toEqual({
      contentLength: 9, contentType: "application/pdf", etag: '"test-etag"',
    });
    await storage.deleteObject(key);
    expect(handle.mock.calls.map(([request]) => request.method)).toEqual(["HEAD", "DELETE"]);
    for (const [request] of handle.mock.calls) {
      expect(request.hostname).toBe(new URL(endpoint).hostname);
      expect(request.protocol).toBe("https:");
      expect(request.path).toBe(`/storage/v1/s3/${bucket}/${key}`);
      expect(request.query).not.toHaveProperty("versionId");
    }
  });
});
