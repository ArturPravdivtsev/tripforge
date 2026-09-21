import type { TripDocument } from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { S3StorageService } from "../storage/s3-storage.service";
import type { TripPermissionsService } from "./trip-permissions.service";
import type {
  DocumentRecord,
  TripDocumentsRepository,
} from "./trip-documents.repository";
import { TripDocumentsService } from "./trip-documents.service";

describe("TripDocumentsService", () => {
  const documents = {
    createPending: vi.fn(),
    delete: vi.fn(),
    find: vi.fn(),
    linkBelongsToTrip: vi.fn(),
    listReady: vi.fn(),
    markReady: vi.fn(),
    updateMetadata: vi.fn(),
  };
  const permissions = {
    requireEditable: vi.fn(),
    requireReadable: vi.fn(),
  };
  const storage = {
    createDownloadUrl: vi.fn(),
    createUploadUrl: vi.fn(),
    deleteObject: vi.fn(),
    headObject: vi.fn(),
  };
  const service = new TripDocumentsService(
    documents as unknown as TripDocumentsRepository,
    permissions as unknown as TripPermissionsService,
    storage as unknown as S3StorageService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    permissions.requireEditable.mockResolvedValue({ role: "editor" });
    permissions.requireReadable.mockResolvedValue({ role: "viewer" });
    documents.linkBelongsToTrip.mockResolvedValue(true);
  });

  it("creates pending metadata with an opaque key and returns a signed PUT", async () => {
    documents.createPending.mockImplementation(async (state) =>
      record({
        contentType: state.contentType,
        fileName: state.fileName,
        id: state.id,
        kind: state.kind,
        sizeBytes: state.sizeBytes,
        status: "pending",
        title: state.title,
      }, state.storageKey),
    );
    storage.createUploadUrl.mockResolvedValue({
      expiresAt: "2027-01-01T00:10:00.000Z",
      url: "http://localhost/upload",
    });

    const result = await service.createUpload("user", "trip", {
      contentType: "application/pdf",
      fileName: "../../ticket.pdf",
      kind: "ticket",
      sizeBytes: 42,
      title: "Ticket",
    });

    const state = documents.createPending.mock.calls[0]?.[0];
    expect(state.storageKey).toMatch(/^trips\/trip\/documents\/[0-9a-f-]+\/[0-9a-f-]+$/);
    expect(state.storageKey).not.toContain("ticket.pdf");
    expect(result.upload).toMatchObject({
      headers: { "Content-Type": "application/pdf" },
      method: "PUT",
      url: "http://localhost/upload",
    });
  });

  it("removes pending metadata when signing fails", async () => {
    documents.createPending.mockImplementation(async (state) =>
      record(undefined, state.storageKey),
    );
    storage.createUploadUrl.mockRejectedValue(new Error("signing unavailable"));
    documents.delete.mockResolvedValue("opaque");

    await expect(
      service.createUpload("user", "trip", {
        contentType: "image/png",
        fileName: "map.png",
        kind: "image",
        sizeBytes: 10,
        title: "Map",
      }),
    ).rejects.toThrow("signing unavailable");
    expect(documents.delete).toHaveBeenCalledWith("trip", expect.any(String));
  });

  it("keeps an incomplete upload pending", async () => {
    documents.find.mockResolvedValue(record());
    storage.headObject.mockResolvedValue(null);
    await expect(service.complete("user", "trip", "document")).rejects.toMatchObject({
      response: { code: "DOCUMENT_UPLOAD_NOT_FOUND" },
    });
    expect(documents.markReady).not.toHaveBeenCalled();
  });

  it("rejects mismatched object size or content type", async () => {
    documents.find.mockResolvedValue(record());
    storage.headObject.mockResolvedValue({
      contentLength: 41,
      contentType: "image/png",
      etag: null,
    });
    await expect(service.complete("user", "trip", "document")).rejects.toMatchObject({
      response: { code: "DOCUMENT_UPLOAD_MISMATCH" },
    });
  });

  it("verifies HEAD metadata and makes completion idempotent", async () => {
    const pending = record();
    const ready = record({ readyAt: "2027-01-01T00:00:00.000Z", status: "ready" });
    documents.find.mockResolvedValueOnce(pending).mockResolvedValueOnce(ready);
    storage.headObject.mockResolvedValue({
      contentLength: 42,
      contentType: "application/pdf",
      etag: '"etag"',
    });
    documents.markReady.mockResolvedValue(ready);

    await expect(service.complete("user", "trip", "document")).resolves.toEqual(
      ready.document,
    );
    await expect(service.complete("user", "trip", "document")).resolves.toEqual(
      ready.document,
    );
    expect(storage.headObject).toHaveBeenCalledTimes(1);
  });

  it("rejects a foreign linked entity with a scoped code", async () => {
    documents.linkBelongsToTrip.mockResolvedValue(false);
    await expect(
      service.createUpload("user", "trip", {
        contentType: "application/pdf",
        fileName: "receipt.pdf",
        kind: "receipt",
        link: { id: "foreign", type: "expense" },
        sizeBytes: 42,
        title: "Receipt",
      }),
    ).rejects.toMatchObject({ response: { code: "EXPENSE_NOT_FOUND" } });
  });

  it("keeps metadata deleted when object cleanup fails", async () => {
    documents.delete.mockResolvedValue("opaque");
    storage.deleteObject.mockRejectedValue(new Error("S3 unavailable"));
    await expect(service.delete("user", "trip", "document")).resolves.toBeUndefined();
    expect(documents.delete).toHaveBeenCalledBefore(storage.deleteObject);
  });
});

function record(
  overrides: Partial<TripDocument> = {},
  storageKey = "opaque",
): DocumentRecord {
  return {
    document: {
      contentType: "application/pdf",
      createdAt: "2027-01-01T00:00:00.000Z",
      fileName: "ticket.pdf",
      id: "document",
      kind: "ticket",
      link: null,
      readyAt: null,
      sizeBytes: 42,
      status: "pending",
      title: "Ticket",
      uploadedBy: {
        displayName: "Artur",
        email: "artur@example.com",
        userId: "user",
      },
      ...overrides,
    },
    storageKey,
  };
}
