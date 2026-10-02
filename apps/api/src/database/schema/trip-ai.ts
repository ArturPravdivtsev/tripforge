import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { AiProposalPayload } from "@tripforge/contracts";

import { trips } from "./trips";
import { users } from "./users";

export const tripAiTurnStatus = pgEnum("trip_ai_turn_status", [
  "pending",
  "completed",
  "failed",
]);

export const tripAiProposalType = pgEnum("trip_ai_proposal_type", [
  "itinerary_create",
  "itinerary_update",
  "itinerary_move",
]);

export const tripAiProposalStatus = pgEnum("trip_ai_proposal_status", [
  "pending",
  "applied",
  "dismissed",
  "stale",
]);

export const tripAiConversations = pgTable(
  "trip_ai_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("trip_ai_conversations_owner_updated_idx").on(
      table.tripId,
      table.userId,
      table.updatedAt,
      table.id,
    ),
    check(
      "trip_ai_conversations_title_not_blank_check",
      sql`length(btrim(${table.title})) > 0`,
    ),
  ],
);

export const tripAiTurns = pgTable(
  "trip_ai_turns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => tripAiConversations.id, { onDelete: "cascade" }),
    status: tripAiTurnStatus("status").notNull(),
    userContent: varchar("user_content", { length: 4000 }).notNull(),
    assistantContent: text("assistant_content"),
    model: varchar("model", { length: 100 }),
    promptVersion: varchar("prompt_version", { length: 32 }).notNull(),
    inputTokens: integer("input_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    outputTokens: integer("output_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    errorCode: varchar("error_code", { length: 80 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("trip_ai_turns_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
      table.id,
    ),
    uniqueIndex("trip_ai_turns_one_pending_idx")
      .on(table.conversationId)
      .where(sql`${table.status} = 'pending'`),
    check(
      "trip_ai_turns_user_content_not_blank_check",
      sql`length(btrim(${table.userContent})) > 0`,
    ),
    check(
      "trip_ai_turns_tokens_nonnegative_check",
      sql`coalesce(${table.inputTokens}, 0) >= 0 and coalesce(${table.cachedInputTokens}, 0) >= 0 and coalesce(${table.outputTokens}, 0) >= 0 and coalesce(${table.reasoningTokens}, 0) >= 0`,
    ),
  ],
);

export const tripAiProposals = pgTable(
  "trip_ai_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => tripAiTurns.id, { onDelete: "cascade" }),
    type: tripAiProposalType("type").notNull(),
    status: tripAiProposalStatus("status").default("pending").notNull(),
    payload: jsonb("payload").$type<AiProposalPayload>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (table) => [
    index("trip_ai_proposals_turn_idx").on(table.turnId, table.createdAt),
    check(
      "trip_ai_proposals_payload_object_check",
      sql`jsonb_typeof(${table.payload}) = 'object'`,
    ),
  ],
);
