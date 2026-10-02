import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { TripDocumentContentType } from "@tripforge/contracts";

import {
  DOWNLOAD_URL_TTL_SECONDS,
  S3_INTERNAL_CLIENT,
  S3_SIGNING_CLIENT,
  S3_OPERATION_TIMEOUT_MS,
  UPLOAD_URL_TTL_SECONDS,
} from "./storage.constants";

export type StoredObjectHead = Readonly<{
  contentLength: number;
  contentType: string | undefined;
  etag: string | null;
}>;

@Injectable()
export class S3StorageService {
  private readonly bucket: string;

  constructor(
    config: ConfigService,
    @Inject(S3_INTERNAL_CLIENT) private readonly internalClient: S3Client,
    @Inject(S3_SIGNING_CLIENT) private readonly signingClient: S3Client,
  ) {
    this.bucket = config.getOrThrow<string>("S3_BUCKET");
  }

  async createUploadUrl(
    storageKey: string,
    contentType: TripDocumentContentType,
  ): Promise<{ url: string; expiresAt: string }> {
    const url = await getSignedUrl(
      this.signingClient,
      new PutObjectCommand({
        Bucket: this.bucket,
        ContentType: contentType,
        Key: storageKey,
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
    return {
      expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
      url,
    };
  }

  async createDownloadUrl(
    storageKey: string,
    fileName: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const url = await getSignedUrl(
      this.signingClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ResponseContentDisposition: contentDisposition(fileName),
      }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
    return {
      expiresAt: new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000).toISOString(),
      url,
    };
  }

  async headObject(storageKey: string): Promise<StoredObjectHead | null> {
    try {
      const result = await this.internalClient.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
        { abortSignal: AbortSignal.timeout(S3_OPERATION_TIMEOUT_MS) },
      );
      return {
        contentLength: result.ContentLength ?? -1,
        contentType: result.ContentType,
        etag: result.ETag ?? null,
      };
    } catch (error) {
      if (isMissingObjectError(error)) return null;
      throw error;
    }
  }

  async deleteObject(storageKey: string): Promise<void> {
    await this.internalClient.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      { abortSignal: AbortSignal.timeout(S3_OPERATION_TIMEOUT_MS) },
    );
  }
}

function contentDisposition(fileName: string): string {
  const safe = [...fileName]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 ||
        code > 126 ||
        ['"', "\\", "/", ";"].includes(character)
        ? "_"
        : character;
    })
    .join("")
    .trim();
  return `attachment; filename="${safe || "download"}"`;
}

function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === "NoSuchKey" ||
    candidate.name === "NotFound"
  );
}
