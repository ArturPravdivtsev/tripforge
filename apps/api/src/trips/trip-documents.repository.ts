import { Inject, Injectable } from "@nestjs/common";
import type {
  ExpenseParticipant,
  TripDocument,
  TripDocumentContentType,
  TripDocumentKind,
  TripDocumentLink,
  TripDocumentStatus,
} from "@tripforge/contracts";
import { and, desc, eq } from "drizzle-orm";

import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";
import {
  itineraryItems,
  tripDays,
  tripDocuments,
  tripExpenses,
  tripReservations,
  users,
} from "../database/schema";

export type PendingDocumentState = Readonly<{
  id: string;
  tripId: string;
  kind: TripDocumentKind;
  title: string;
  fileName: string;
  contentType: TripDocumentContentType;
  sizeBytes: number;
  storageKey: string;
  uploadedByUserId: string;
  link: TripDocumentLink;
}>;

export type DocumentRecord = Readonly<{
  document: TripDocument;
  storageKey: string;
}>;

const selection = {
  contentType: tripDocuments.contentType,
  createdAt: tripDocuments.createdAt,
  expenseId: tripDocuments.expenseId,
  fileName: tripDocuments.originalFileName,
  id: tripDocuments.id,
  itineraryItemId: tripDocuments.itineraryItemId,
  kind: tripDocuments.kind,
  readyAt: tripDocuments.readyAt,
  reservationId: tripDocuments.reservationId,
  sizeBytes: tripDocuments.sizeBytes,
  status: tripDocuments.status,
  storageKey: tripDocuments.storageKey,
  title: tripDocuments.title,
  uploadedByDisplayName: users.displayName,
  uploadedByEmail: users.email,
  uploadedByUserId: tripDocuments.uploadedByUserId,
};

type DocumentRow = {
  contentType: string;
  createdAt: Date;
  expenseId: string | null;
  fileName: string;
  id: string;
  itineraryItemId: string | null;
  kind: TripDocumentKind;
  readyAt: Date | null;
  reservationId: string | null;
  sizeBytes: number;
  status: TripDocumentStatus;
  storageKey: string;
  title: string;
  uploadedByDisplayName: string | null;
  uploadedByEmail: string;
  uploadedByUserId: string;
};

@Injectable()
export class TripDocumentsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async listReady(tripId: string): Promise<TripDocument[]> {
    const rows = await this.database
      .select(selection)
      .from(tripDocuments)
      .innerJoin(users, eq(users.id, tripDocuments.uploadedByUserId))
      .where(
        and(
          eq(tripDocuments.tripId, tripId),
          eq(tripDocuments.status, "ready"),
        ),
      )
      .orderBy(desc(tripDocuments.createdAt), desc(tripDocuments.id));
    return rows.map(toRecord).map(({ document }) => document);
  }

  async find(tripId: string, documentId: string): Promise<DocumentRecord | undefined> {
    const [row] = await this.database
      .select(selection)
      .from(tripDocuments)
      .innerJoin(users, eq(users.id, tripDocuments.uploadedByUserId))
      .where(
        and(
          eq(tripDocuments.tripId, tripId),
          eq(tripDocuments.id, documentId),
        ),
      )
      .limit(1);
    return row ? toRecord(row) : undefined;
  }

  async createPending(state: PendingDocumentState): Promise<DocumentRecord> {
    await this.database.insert(tripDocuments).values({
      contentType: state.contentType,
      expenseId: state.link?.type === "expense" ? state.link.id : null,
      id: state.id,
      itineraryItemId: state.link?.type === "itinerary" ? state.link.id : null,
      kind: state.kind,
      originalFileName: state.fileName,
      reservationId: state.link?.type === "reservation" ? state.link.id : null,
      sizeBytes: state.sizeBytes,
      storageKey: state.storageKey,
      title: state.title,
      tripId: state.tripId,
      uploadedByUserId: state.uploadedByUserId,
    });
    const created = await this.find(state.tripId, state.id);
    if (!created) throw new Error("Created document could not be loaded");
    return created;
  }

  async markReady(
    tripId: string,
    documentId: string,
    etag: string | null,
  ): Promise<DocumentRecord | undefined> {
    const rows = await this.database
      .update(tripDocuments)
      .set({ etag, readyAt: new Date(), status: "ready", updatedAt: new Date() })
      .where(
        and(
          eq(tripDocuments.tripId, tripId),
          eq(tripDocuments.id, documentId),
          eq(tripDocuments.status, "pending"),
        ),
      )
      .returning({ id: tripDocuments.id });
    return rows.length > 0 ? this.find(tripId, documentId) : undefined;
  }

  async updateMetadata(
    tripId: string,
    documentId: string,
    values: Readonly<{
      kind: TripDocumentKind;
      title: string;
      link: TripDocumentLink;
    }>,
  ): Promise<DocumentRecord | undefined> {
    const rows = await this.database
      .update(tripDocuments)
      .set({
        expenseId: values.link?.type === "expense" ? values.link.id : null,
        itineraryItemId:
          values.link?.type === "itinerary" ? values.link.id : null,
        kind: values.kind,
        reservationId:
          values.link?.type === "reservation" ? values.link.id : null,
        title: values.title,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tripDocuments.tripId, tripId),
          eq(tripDocuments.id, documentId),
        ),
      )
      .returning({ id: tripDocuments.id });
    return rows.length > 0 ? this.find(tripId, documentId) : undefined;
  }

  async delete(tripId: string, documentId: string): Promise<string | undefined> {
    const [row] = await this.database
      .delete(tripDocuments)
      .where(
        and(
          eq(tripDocuments.tripId, tripId),
          eq(tripDocuments.id, documentId),
        ),
      )
      .returning({ storageKey: tripDocuments.storageKey });
    return row?.storageKey;
  }

  async linkBelongsToTrip(
    tripId: string,
    link: NonNullable<TripDocumentLink>,
  ): Promise<boolean> {
    if (link.type === "itinerary") {
      const [row] = await this.database
        .select({ id: itineraryItems.id })
        .from(itineraryItems)
        .innerJoin(tripDays, eq(tripDays.id, itineraryItems.tripDayId))
        .where(and(eq(tripDays.tripId, tripId), eq(itineraryItems.id, link.id)))
        .limit(1);
      return Boolean(row);
    }
    const table = link.type === "reservation" ? tripReservations : tripExpenses;
    const [row] = await this.database
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.tripId, tripId), eq(table.id, link.id)))
      .limit(1);
    return Boolean(row);
  }
}

function toRecord(row: DocumentRow): DocumentRecord {
  const uploadedBy: ExpenseParticipant = {
    displayName: row.uploadedByDisplayName,
    email: row.uploadedByEmail,
    userId: row.uploadedByUserId,
  };
  return {
    document: {
      contentType: row.contentType as TripDocumentContentType,
      createdAt: row.createdAt.toISOString(),
      fileName: row.fileName,
      id: row.id,
      kind: row.kind,
      link: linkFromRow(row),
      readyAt: row.readyAt?.toISOString() ?? null,
      sizeBytes: row.sizeBytes,
      status: row.status,
      title: row.title,
      uploadedBy,
    },
    storageKey: row.storageKey,
  };
}

function linkFromRow(row: DocumentRow): TripDocumentLink {
  if (row.itineraryItemId) return { id: row.itineraryItemId, type: "itinerary" };
  if (row.reservationId) return { id: row.reservationId, type: "reservation" };
  if (row.expenseId) return { id: row.expenseId, type: "expense" };
  return null;
}
