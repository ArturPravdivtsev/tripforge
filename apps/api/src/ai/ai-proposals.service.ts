import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type {
  AiProposal,
  AiProposalPayload,
  ItineraryItem,
  ItineraryItemKind,
} from "@tripforge/contracts";
import { and, eq } from "drizzle-orm";

import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";
import {
  tripAiConversations,
  tripAiProposals,
  tripAiTurns,
} from "../database/schema";
import { ObservabilityMetrics } from "../observability/metrics.service";
import { TripRealtimePublisher } from "../realtime/trip-realtime.publisher";
import { ItineraryItemsService } from "../trips/itinerary-items.service";
import { TripPermissionsService } from "../trips/trip-permissions.service";

const ITEM_KINDS = new Set<ItineraryItemKind>([
  "activity",
  "food",
  "transport",
  "accommodation",
  "other",
]);

@Injectable()
export class AiProposalsService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly items: ItineraryItemsService,
    private readonly permissions: TripPermissionsService,
    private readonly realtime: TripRealtimePublisher,
    private readonly metrics: ObservabilityMetrics,
  ) {}

  async apply(
    userId: string,
    tripId: string,
    proposalId: string,
  ): Promise<AiProposal> {
    await this.permissions.requireEditable(userId, tripId);
    const outcome = await this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .select({ proposal: tripAiProposals })
        .from(tripAiProposals)
        .innerJoin(tripAiTurns, eq(tripAiTurns.id, tripAiProposals.turnId))
        .innerJoin(
          tripAiConversations,
          eq(tripAiConversations.id, tripAiTurns.conversationId),
        )
        .where(
          and(
            eq(tripAiProposals.id, proposalId),
            eq(tripAiConversations.tripId, tripId),
            eq(tripAiConversations.userId, userId),
          ),
        )
        .for("update", { of: tripAiProposals })
        .limit(1);
      if (!row) return { kind: "not_found" as const };
      if (row.proposal.status === "applied") {
        return {
          kind: "already_applied" as const,
          proposal: toProposal(row.proposal),
        };
      }
      if (row.proposal.status !== "pending") {
        return { kind: "unavailable" as const };
      }
      let payload: AiProposalPayload;
      try {
        payload = validateProposalPayload(row.proposal.payload);
      } catch {
        const [stale] = await transaction
          .update(tripAiProposals)
          .set({ status: "stale" })
          .where(eq(tripAiProposals.id, proposalId))
          .returning();
        return {
          kind: "stale" as const,
          proposal: stale && toProposal(stale),
        };
      }
      let item: ItineraryItem | undefined;
      if (payload.type === "itinerary_create") {
        item = await this.items.createInTransaction(transaction, tripId, {
          dayId: payload.dayId,
          endTime: payload.endTime,
          kind: payload.kind,
          notes: payload.notes,
          place: null,
          startTime: payload.startTime,
          title: payload.title,
        });
      } else if (payload.type === "itinerary_update") {
        item = await this.items.updateInTransaction(
          transaction,
          tripId,
          payload.itemId,
          payload.changes,
        );
      } else {
        item = await this.items.moveInTransaction(
          transaction,
          tripId,
          payload.itemId,
          payload.targetDayId,
          payload.targetPosition,
        );
      }
      if (!item) {
        const [stale] = await transaction
          .update(tripAiProposals)
          .set({ status: "stale" })
          .where(eq(tripAiProposals.id, proposalId))
          .returning();
        return { kind: "stale" as const, proposal: stale && toProposal(stale) };
      }
      const [applied] = await transaction
        .update(tripAiProposals)
        .set({ appliedAt: new Date(), status: "applied" })
        .where(eq(tripAiProposals.id, proposalId))
        .returning();
      if (!applied) throw new Error("Applied proposal could not be returned");
      return { kind: "applied" as const, proposal: toProposal(applied) };
    });

    if (outcome.kind === "not_found") throw proposalNotFound();
    if (outcome.kind === "stale") {
      throw proposalConflict(
        "AI_PROPOSAL_STALE",
        "This suggestion no longer matches the current trip",
      );
    }
    if (outcome.kind === "unavailable") {
      throw proposalConflict(
        "AI_PROPOSAL_NOT_PENDING",
        "This suggestion can no longer be applied",
      );
    }
    if (outcome.kind === "already_applied") return outcome.proposal;
    this.realtime.invalidate(tripId, ["itinerary"]);
    this.metrics.aiProposal(outcome.proposal.type, "applied");
    return outcome.proposal;
  }

  async dismiss(
    userId: string,
    tripId: string,
    proposalId: string,
  ): Promise<AiProposal> {
    await this.permissions.requireReadable(userId, tripId);
    const [row] = await this.database
      .select({ proposal: tripAiProposals })
      .from(tripAiProposals)
      .innerJoin(tripAiTurns, eq(tripAiTurns.id, tripAiProposals.turnId))
      .innerJoin(
        tripAiConversations,
        eq(tripAiConversations.id, tripAiTurns.conversationId),
      )
      .where(
        and(
          eq(tripAiProposals.id, proposalId),
          eq(tripAiProposals.status, "pending"),
          eq(tripAiConversations.tripId, tripId),
          eq(tripAiConversations.userId, userId),
        ),
      )
      .limit(1);
    if (!row) throw proposalNotFound();
    const [dismissed] = await this.database
      .update(tripAiProposals)
      .set({ dismissedAt: new Date(), status: "dismissed" })
      .where(
        and(
          eq(tripAiProposals.id, proposalId),
          eq(tripAiProposals.status, "pending"),
        ),
      )
      .returning();
    if (!dismissed) {
      throw proposalConflict(
        "AI_PROPOSAL_NOT_PENDING",
        "This suggestion can no longer be dismissed",
      );
    }
    this.metrics.aiProposal(dismissed.type, "dismissed");
    return toProposal(dismissed);
  }
}

function validateProposalPayload(value: unknown): AiProposalPayload {
  if (!isObject(value) || typeof value.type !== "string") throw invalidPayload();
  if (value.type === "itinerary_create") {
    if (
      !hasExactKeys(value, ["type", "dayId", "kind", "title", "startTime", "endTime", "notes"]) ||
      !uuid(value.dayId) ||
      !ITEM_KINDS.has(value.kind as ItineraryItemKind) ||
      !boundedString(value.title, 1, 200) ||
      !nullableTime(value.startTime) ||
      !nullableTime(value.endTime) ||
      !nullableString(value.notes, 5000)
    ) throw invalidPayload();
    return value as unknown as AiProposalPayload;
  }
  if (value.type === "itinerary_update") {
    if (
      !hasExactKeys(value, ["type", "itemId", "changes"]) ||
      !uuid(value.itemId) ||
      !isObject(value.changes)
    ) throw invalidPayload();
    const keys = Object.keys(value.changes);
    if (keys.length === 0 || keys.some((key) => !["kind", "title", "startTime", "endTime", "notes"].includes(key))) throw invalidPayload();
    const changes = value.changes;
    if (
      (changes.kind !== undefined && !ITEM_KINDS.has(changes.kind as ItineraryItemKind)) ||
      (changes.title !== undefined && !boundedString(changes.title, 1, 200)) ||
      (changes.startTime !== undefined && !nullableTime(changes.startTime)) ||
      (changes.endTime !== undefined && !nullableTime(changes.endTime)) ||
      (changes.notes !== undefined && !nullableString(changes.notes, 5000))
    ) throw invalidPayload();
    return value as unknown as AiProposalPayload;
  }
  if (
    value.type === "itinerary_move" &&
    hasExactKeys(value, ["type", "itemId", "targetDayId", "targetPosition"]) &&
    uuid(value.itemId) &&
    uuid(value.targetDayId) &&
    Number.isInteger(value.targetPosition) &&
    (value.targetPosition as number) >= 0
  ) return value as unknown as AiProposalPayload;
  throw invalidPayload();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}
function uuid(value: unknown): boolean {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
function boundedString(value: unknown, min: number, max: number): boolean {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}
function nullableString(value: unknown, max: number): boolean {
  return value === null || (typeof value === "string" && value.length <= max);
}
function nullableTime(value: unknown): boolean {
  return value === null || (typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value));
}
function invalidPayload(): HttpException {
  return proposalConflict("AI_PROPOSAL_STALE", "This suggestion is no longer valid");
}
function proposalNotFound(): HttpException {
  return new HttpException(
    { code: "AI_PROPOSAL_NOT_FOUND", message: "Assistant proposal not found" },
    HttpStatus.NOT_FOUND,
  );
}
function proposalConflict(code: string, message: string): HttpException {
  return new HttpException({ code, message }, HttpStatus.CONFLICT);
}
function toProposal(row: typeof tripAiProposals.$inferSelect): AiProposal {
  return {
    appliedAt: row.appliedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    dismissedAt: row.dismissedAt?.toISOString() ?? null,
    id: row.id,
    payload: row.payload,
    status: row.status,
    type: row.type,
  };
}
