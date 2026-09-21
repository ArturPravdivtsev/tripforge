import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DOWNLOAD_URL_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
} from "./storage.constants";
import { S3StorageService } from "./s3-storage.service";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}));

describe("S3StorageService", () => {
  const internalSend = vi.fn();
  const internalClient = { send: internalSend } as unknown as S3Client;
  const signingClient = { client: "public" } as unknown as S3Client;
  const service = new S3StorageService(
    new ConfigService({ S3_BUCKET: "tripforge-documents" }),
    internalClient,
    signingClient,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("presigns an exact-content-type PUT for ten minutes on the signing client", async () => {
    vi.mocked(getSignedUrl).mockResolvedValue("http://localhost/upload");

    const result = await service.createUploadUrl(
      "trips/trip/documents/document/opaque",
      "application/pdf",
    );

    expect(result.url).toBe("http://localhost/upload");
    expect(getSignedUrl).toHaveBeenCalledWith(
      signingClient,
      expect.any(PutObjectCommand),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
    const command = vi.mocked(getSignedUrl).mock.calls[0]?.[1];
    expect(command?.input).toEqual({
      Bucket: "tripforge-documents",
      ContentType: "application/pdf",
      Key: "trips/trip/documents/document/opaque",
    });
  });

  it("presigns an attachment GET for five minutes without exposing unsafe filename bytes", async () => {
    vi.mocked(getSignedUrl).mockResolvedValue("http://localhost/download");

    await service.createDownloadUrl("opaque", 'evil\r\n"名.pdf');

    expect(getSignedUrl).toHaveBeenCalledWith(
      signingClient,
      expect.any(GetObjectCommand),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
    const command = vi.mocked(getSignedUrl).mock.calls[0]?.[1];
    expect(command?.input).toMatchObject({
      Bucket: "tripforge-documents",
      Key: "opaque",
      ResponseContentDisposition: 'attachment; filename="evil____.pdf"',
    });
  });

  it("uses the internal client for HEAD and returns verified metadata", async () => {
    internalSend.mockResolvedValue({
      ContentLength: 42,
      ContentType: "image/png",
      ETag: '"etag"',
    });

    await expect(service.headObject("opaque")).resolves.toEqual({
      contentLength: 42,
      contentType: "image/png",
      etag: '"etag"',
    });
    expect(internalSend.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it("maps an S3 404 HEAD to a missing object", async () => {
    internalSend.mockRejectedValue({ $metadata: { httpStatusCode: 404 } });
    await expect(service.headObject("missing")).resolves.toBeNull();
  });

  it("deletes through the internal client", async () => {
    internalSend.mockResolvedValue({});
    await service.deleteObject("opaque");
    expect(internalSend.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });
});
