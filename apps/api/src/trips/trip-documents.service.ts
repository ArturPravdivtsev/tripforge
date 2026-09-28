import { randomUUID } from "node:crypto";

import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import type {
  CreateDocumentUploadRequest,
  CreateDocumentUploadResponse,
  TripDocument,
  TripDocumentDownload,
  TripDocumentLink,
  UpdateTripDocumentRequest,
} from "@tripforge/contracts";

import { S3StorageService } from "../storage/s3-storage.service";
import { TripRealtimePublisher } from "../realtime/trip-realtime.publisher";
import { TripPermissionsService } from "./trip-permissions.service";
import { TripDocumentsRepository } from "./trip-documents.repository";

@Injectable()
export class TripDocumentsService {
  private readonly logger = new Logger(TripDocumentsService.name);

  constructor(
    private readonly documents: TripDocumentsRepository,
    private readonly permissions: TripPermissionsService,
    private readonly storage: S3StorageService,
    private readonly realtime: TripRealtimePublisher,
  ) {}

  async list(userId: string, tripId: string): Promise<TripDocument[]> {
    await this.permissions.requireReadable(userId, tripId);
    return this.documents.listReady(tripId);
  }

  async createUpload(
    userId: string,
    tripId: string,
    input: CreateDocumentUploadRequest,
  ): Promise<CreateDocumentUploadResponse> {
    await this.permissions.requireEditable(userId, tripId);
    const link = input.link ?? null;
    await this.validateLink(tripId, link);

    const documentId = randomUUID();
    const storageKey = `trips/${tripId}/documents/${documentId}/${randomUUID()}`;
    const record = await this.documents.createPending({
      contentType: input.contentType,
      fileName: input.fileName,
      id: documentId,
      kind: input.kind,
      link,
      sizeBytes: input.sizeBytes,
      storageKey,
      title: input.title.trim(),
      tripId,
      uploadedByUserId: userId,
    });
    if (!record) throw tripNotFound();

    try {
      const signed = await this.storage.createUploadUrl(
        storageKey,
        input.contentType,
      );
      return {
        document: record.document,
        upload: {
          headers: { "Content-Type": input.contentType },
          method: "PUT",
          ...signed,
        },
      };
    } catch (error) {
      await this.documents
        .deleteMetadata(tripId, documentId)
        .catch((cleanupError) => {
          this.logger.error(
            `Failed to remove document metadata after presign failure: ${documentId}`,
            cleanupError instanceof Error ? cleanupError.stack : undefined,
          );
        });
      throw error;
    }
  }

  async complete(
    userId: string,
    tripId: string,
    documentId: string,
  ): Promise<TripDocument> {
    await this.permissions.requireEditable(userId, tripId);
    const record = await this.documents.find(tripId, documentId);
    if (!record) throw documentNotFound();
    if (record.document.status === "ready") return record.document;

    const head = await this.storage.headObject(record.storageKey);
    if (!head) {
      throw documentError(
        "DOCUMENT_UPLOAD_NOT_FOUND",
        "Uploaded object was not found",
        HttpStatus.CONFLICT,
      );
    }
    if (
      head.contentLength !== record.document.sizeBytes ||
      head.contentType !== record.document.contentType
    ) {
      throw documentError(
        "DOCUMENT_UPLOAD_MISMATCH",
        "Uploaded object metadata does not match the document",
        HttpStatus.CONFLICT,
      );
    }

    const ready = await this.documents.markReady(
      tripId,
      documentId,
      userId,
      head.etag,
    );
    if (ready) {
      const completed = await this.documents.find(tripId, documentId);
      if (!completed) throw documentNotFound();
      this.realtime.invalidate(tripId, ["documents"]);
      this.realtime.notificationsChanged(ready.notificationUserIds);
      return completed.document;
    }
    const concurrent = await this.documents.find(tripId, documentId);
    if (concurrent?.document.status === "ready") return concurrent.document;
    throw documentNotFound();
  }

  async download(
    userId: string,
    tripId: string,
    documentId: string,
  ): Promise<TripDocumentDownload> {
    await this.permissions.requireReadable(userId, tripId);
    const record = await this.documents.find(tripId, documentId);
    if (!record) throw documentNotFound();
    if (record.document.status !== "ready") {
      throw documentError(
        "DOCUMENT_NOT_READY",
        "Document upload is not ready",
        HttpStatus.CONFLICT,
      );
    }
    return this.storage.createDownloadUrl(
      record.storageKey,
      record.document.fileName,
    );
  }

  async update(
    userId: string,
    tripId: string,
    documentId: string,
    input: UpdateTripDocumentRequest,
  ): Promise<TripDocument> {
    await this.permissions.requireEditable(userId, tripId);
    if (!Object.values(input).some((value) => value !== undefined)) {
      throw documentError(
        "EMPTY_DOCUMENT_UPDATE",
        "Provide at least one document field to update",
        HttpStatus.BAD_REQUEST,
      );
    }
    const existing = await this.documents.find(tripId, documentId);
    if (!existing) throw documentNotFound();
    const link = input.link === undefined ? existing.document.link : input.link;
    await this.validateLink(tripId, link);
    const updated = await this.documents.updateMetadata(tripId, documentId, {
      kind: input.kind ?? existing.document.kind,
      link,
      title: input.title?.trim() ?? existing.document.title,
    });
    if (!updated) throw documentNotFound();
    this.realtime.invalidate(tripId, ["documents"]);
    return updated.document;
  }

  async delete(
    userId: string,
    tripId: string,
    documentId: string,
  ): Promise<void> {
    await this.permissions.requireEditable(userId, tripId);
    const deleted = await this.documents.deleteWithOutbox(tripId, documentId);
    if (!deleted) throw documentNotFound();
    this.realtime.invalidate(tripId, ["documents"]);
  }

  private async validateLink(
    tripId: string,
    link: TripDocumentLink,
  ): Promise<void> {
    if (!link || (await this.documents.linkBelongsToTrip(tripId, link))) return;
    const errors = {
      expense: ["EXPENSE_NOT_FOUND", "Expense not found"],
      itinerary: ["ITINERARY_ITEM_NOT_FOUND", "Itinerary item not found"],
      reservation: ["RESERVATION_NOT_FOUND", "Reservation not found"],
    } as const;
    const [code, message] = errors[link.type];
    throw documentError(code, message, HttpStatus.NOT_FOUND);
  }
}

function tripNotFound(): HttpException {
  return documentError("TRIP_NOT_FOUND", "Trip not found", HttpStatus.NOT_FOUND);
}

function documentNotFound(): HttpException {
  return documentError(
    "DOCUMENT_NOT_FOUND",
    "Document not found",
    HttpStatus.NOT_FOUND,
  );
}

function documentError(
  code: string,
  message: string,
  status: HttpStatus,
): HttpException {
  return new HttpException({ code, message }, status);
}
