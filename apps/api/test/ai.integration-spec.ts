import { resolve } from "node:path";

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AiConversationsService } from "../src/ai/ai-conversations.service";
import { AiProposalsService } from "../src/ai/ai-proposals.service";
import { AiRepository } from "../src/ai/ai.repository";
import { AiToolRegistry } from "../src/ai/ai-tool-registry";
import { TripRealtimePublisher } from "../src/realtime/trip-realtime.publisher";

const ownerId = "10000000-0000-4000-8000-000000000001";
const editorId = "10000000-0000-4000-8000-000000000002";
const viewerId = "10000000-0000-4000-8000-000000000003";
const outsiderId = "10000000-0000-4000-8000-000000000004";
const tripId = "20000000-0000-4000-8000-000000000001";
const firstDayId = "30000000-0000-4000-8000-000000000001";
const secondDayId = "30000000-0000-4000-8000-000000000002";
const itemId = "40000000-0000-4000-8000-000000000001";

describe("AI persistence, privacy, and proposal transactions", () => {
  let container: StartedPostgreSqlContainer;
  let module: TestingModule;
  let pool: Pool;
  let conversations: AiConversationsService;
  let proposals: AiProposalsService;
  let repository: AiRepository;
  let tools: AiToolRegistry;
  let realtime: TripRealtimePublisher;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.6-bookworm")
      .withDatabase("tripforge")
      .withUsername("tripforge")
      .withPassword("tripforge")
      .start();
    const databaseUrl = container.getConnectionUri();
    const migrationPool = new Pool({ connectionString: databaseUrl });
    await migrate(drizzle(migrationPool), {
      migrationsFolder: resolve(process.cwd(), "drizzle"),
    });
    await migrationPool.end();

    process.env.AI_ASSISTANT_ENABLED = "true";
    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = "test";
    process.env.OPENAI_API_KEY = "integration-test-key";
    process.env.WEB_ORIGIN = "http://127.0.0.1:3000";

    const { AppModule } = await import("../src/app.module");
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    conversations = module.get(AiConversationsService);
    proposals = module.get(AiProposalsService);
    repository = module.get(AiRepository);
    tools = module.get(AiToolRegistry);
    realtime = module.get(TripRealtimePublisher);
    pool = new Pool({ connectionString: databaseUrl });
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE TABLE trip_ai_proposals, trip_ai_turns, trip_ai_conversations, itinerary_items, trip_days, trip_members, trips, users CASCADE",
    );
    await pool.query(
      `INSERT INTO users (id, email) VALUES
        ($1, 'owner@example.com'),
        ($2, 'editor@example.com'),
        ($3, 'viewer@example.com'),
        ($4, 'outsider@example.com')`,
      [ownerId, editorId, viewerId, outsiderId],
    );
    await pool.query(
      "INSERT INTO trips (id, owner_id, name, starts_on, ends_on) VALUES ($1, $2, 'Japan', '2027-04-12', '2027-04-13')",
      [tripId, ownerId],
    );
    await pool.query(
      "INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'editor'), ($1, $3, 'viewer')",
      [tripId, editorId, viewerId],
    );
    await pool.query(
      "INSERT INTO trip_days (id, trip_id, date) VALUES ($1, $3, '2027-04-12'), ($2, $3, '2027-04-13')",
      [firstDayId, secondDayId, tripId],
    );
    await pool.query(
      "INSERT INTO itinerary_items (id, trip_day_id, kind, title, start_time, position) VALUES ($1, $2, 'activity', 'Temple', '14:00', 0)",
      [itemId, firstDayId],
    );
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await pool?.end();
    await module?.close();
    await container?.stop();
  });

  it("enforces ownership, current membership, and conversation privacy", async () => {
    const ownerConversation = await conversations.create(ownerId, tripId);
    const editorConversation = await conversations.create(editorId, tripId);

    await expect(
      conversations.detail(editorId, tripId, ownerConversation.id),
    ).rejects.toMatchObject({ response: { code: "AI_CONVERSATION_NOT_FOUND" } });
    await expect(conversations.list(outsiderId, tripId)).rejects.toMatchObject({
      response: { code: "TRIP_NOT_FOUND" },
    });

    await pool.query(
      "DELETE FROM trip_members WHERE trip_id = $1 AND user_id = $2",
      [tripId, editorId],
    );
    await expect(
      conversations.detail(editorId, tripId, editorConversation.id),
    ).rejects.toMatchObject({ response: { code: "TRIP_NOT_FOUND" } });

    await pool.query(
      "INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'editor')",
      [tripId, editorId],
    );
    await expect(
      conversations.detail(editorId, tripId, editorConversation.id),
    ).resolves.toMatchObject({ id: editorConversation.id });
  });

  it("scopes tool reads to the authorized Trip on real PostgreSQL", async () => {
    const otherTripId = "20000000-0000-4000-8000-000000000002";
    const otherDayId = "30000000-0000-4000-8000-000000000003";
    await pool.query(
      "INSERT INTO trips (id, owner_id, name, starts_on, ends_on) VALUES ($1, $2, 'Private Trip', '2027-05-01', '2027-05-01')",
      [otherTripId, outsiderId],
    );
    await pool.query(
      "INSERT INTO trip_days (id, trip_id, date) VALUES ($1, $2, '2027-05-01')",
      [otherDayId, otherTripId],
    );
    await pool.query(
      "INSERT INTO itinerary_items (trip_day_id, kind, title, position) VALUES ($1, 'activity', 'Private item', 0)",
      [otherDayId],
    );

    const itinerary = await tools.execute(
      "get_itinerary",
      JSON.stringify({ dayIds: [], endDate: null, limit: 100, startDate: null }),
      { tripId, userId: ownerId },
    );
    expect(itinerary.output).toContain("Temple");
    expect(itinerary.output).not.toContain("Private item");

    const crossTripDay = await tools.execute(
      "get_itinerary",
      JSON.stringify({ dayIds: [otherDayId], endDate: null, limit: 100, startDate: null }),
      { tripId, userId: ownerId },
    );
    expect(JSON.parse(crossTripDay.output)).toMatchObject({ value: [] });
    await expect(tools.execute("get_trip_overview", "{}", { tripId, userId: outsiderId }))
      .rejects.toMatchObject({ response: { code: "TRIP_NOT_FOUND" } });
  });

  it("enforces direct constraints and cascades AI-private data", async () => {
    await expect(
      pool.query(
        "INSERT INTO trip_ai_conversations (trip_id, user_id, title) VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff', $1, 'Invalid')",
        [ownerId],
      ),
    ).rejects.toMatchObject({ code: "23503" });

    const conversation = await conversations.create(ownerId, tripId);
    const pending = await repository.startTurn(
      tripId,
      ownerId,
      conversation.id,
      "First pending turn",
    );
    await expect(
      repository.startTurn(tripId, ownerId, conversation.id, "Second pending turn"),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
    await repository.failTurn(pending!.id, "TEST_COMPLETE");

    await expect(
      pool.query(
        `INSERT INTO trip_ai_turns
          (conversation_id, status, user_content, prompt_version, input_tokens)
         VALUES ($1, 'completed', 'Invalid tokens', '1', -1)`,
        [conversation.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    const turnId = await insertCompletedTurn(pool, conversation.id);
    await expect(
      pool.query(
        `INSERT INTO trip_ai_proposals (turn_id, type, payload)
         VALUES ($1, 'itinerary_create', '[]'::jsonb)`,
        [turnId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    const editorConversation = await conversations.create(editorId, tripId);
    await pool.query("DELETE FROM users WHERE id = $1", [editorId]);
    expect(
      Number((await pool.query("SELECT count(*) FROM trip_ai_conversations WHERE id = $1", [editorConversation.id])).rows[0].count),
    ).toBe(0);

    await pool.query("DELETE FROM trips WHERE id = $1", [tripId]);
    expect(
      Number((await pool.query("SELECT count(*) FROM trip_ai_conversations WHERE id = $1", [conversation.id])).rows[0].count),
    ).toBe(0);
  });

  it("recovers stale pending turns while keeping active pending turns exclusive", async () => {
    const conversation = await conversations.create(ownerId, tripId);
    const staleId = "50000000-0000-4000-8000-000000000001";
    await pool.query(
      `INSERT INTO trip_ai_turns
        (id, conversation_id, status, user_content, prompt_version, created_at)
       VALUES ($1, $2, 'pending', 'Crashed request', '1', now() - interval '3 minutes')`,
      [staleId, conversation.id],
    );

    const next = await repository.startTurn(
      tripId,
      ownerId,
      conversation.id,
      "Continue safely",
    );
    const stale = await pool.query(
      "SELECT status, error_code FROM trip_ai_turns WHERE id = $1",
      [staleId],
    );

    expect(next).toBeDefined();
    expect(stale.rows[0]).toEqual({
      error_code: "AI_STALE_PENDING_TURN",
      status: "failed",
    });
  });

  it("persists completed turns and proposal drafts atomically", async () => {
    const conversation = await conversations.create(ownerId, tripId);
    const pending = await repository.startTurn(tripId, ownerId, conversation.id, "Add a stop");
    const payload = {
      dayId: firstDayId,
      endTime: null,
      kind: "activity" as const,
      notes: null,
      startTime: null,
      title: "Museum",
      type: "itinerary_create" as const,
    };
    const completed = await repository.completeTurn(
      pending!.id,
      "Here is a suggestion",
      "gpt-6-luna",
      { cachedInputTokens: 0, inputTokens: 10, outputTokens: 5, reasoningTokens: 0 },
      [{ payload }],
    );

    expect(completed).toMatchObject({
      assistantContent: "Here is a suggestion",
      proposals: [{ payload, status: "pending", type: "itinerary_create" }],
      status: "completed",
    });
    expect(await repository.getTurn(pending!.id)).toMatchObject(completed);
  });

  it("applies create/update/move exactly once through domain transactions", async () => {
    const invalidate = vi.spyOn(realtime, "invalidate");
    const conversation = await conversations.create(ownerId, tripId);
    const createId = await insertProposal(pool, conversation.id, "itinerary_create", {
      dayId: firstDayId,
      endTime: "11:00",
      kind: "activity",
      notes: "  Timed entry  ",
      startTime: "10:00",
      title: "  Museum  ",
      type: "itinerary_create",
    });

    const applied = await proposals.apply(ownerId, tripId, createId);
    const repeated = await proposals.apply(ownerId, tripId, createId);
    const createdItems = await pool.query(
      "SELECT id, title, notes, start_time::text, end_time::text FROM itinerary_items WHERE title = 'Museum'",
    );

    expect(applied.status).toBe("applied");
    expect(repeated.id).toBe(applied.id);
    expect(createdItems.rows).toHaveLength(1);
    expect(createdItems.rows[0]).toMatchObject({
      end_time: "11:00:00",
      notes: "Timed entry",
      start_time: "10:00:00",
      title: "Museum",
    });
    expect(invalidate).toHaveBeenCalledTimes(1);

    const createdItemId = createdItems.rows[0].id as string;
    const updateId = await insertProposal(pool, conversation.id, "itinerary_update", {
      changes: { endTime: "12:00", title: "  Modern art museum  " },
      itemId: createdItemId,
      type: "itinerary_update",
    });
    await proposals.apply(ownerId, tripId, updateId);
    expect(
      (await pool.query("SELECT title, end_time::text FROM itinerary_items WHERE id = $1", [createdItemId])).rows[0],
    ).toEqual({ end_time: "12:00:00", title: "Modern art museum" });

    const moveId = await insertProposal(pool, conversation.id, "itinerary_move", {
      itemId: createdItemId,
      targetDayId: secondDayId,
      targetPosition: 0,
      type: "itinerary_move",
    });
    await proposals.apply(ownerId, tripId, moveId);
    expect(
      (await pool.query("SELECT trip_day_id, position FROM itinerary_items WHERE id = $1", [createdItemId])).rows[0],
    ).toEqual({ position: 0, trip_day_id: secondDayId });
  });

  it("rechecks role, staleness, ownership, and dismissal at Apply time", async () => {
    const editorConversation = await conversations.create(editorId, tripId);
    const editorProposal = await insertProposal(pool, editorConversation.id, "itinerary_update", {
      changes: { title: "Morning temple" },
      itemId,
      type: "itinerary_update",
    });
    await pool.query(
      "UPDATE trip_members SET role = 'viewer' WHERE trip_id = $1 AND user_id = $2",
      [tripId, editorId],
    );
    await expect(proposals.apply(editorId, tripId, editorProposal)).rejects.toMatchObject({
      response: { code: "INSUFFICIENT_TRIP_PERMISSION" },
    });

    const ownerConversation = await conversations.create(ownerId, tripId);
    await expect(
      proposals.apply(ownerId, tripId, editorProposal),
    ).rejects.toMatchObject({ response: { code: "AI_PROPOSAL_NOT_FOUND" } });

    const staleProposal = await insertProposal(pool, ownerConversation.id, "itinerary_update", {
      changes: { title: "Gone" },
      itemId,
      type: "itinerary_update",
    });
    await pool.query("DELETE FROM itinerary_items WHERE id = $1", [itemId]);
    await expect(proposals.apply(ownerId, tripId, staleProposal)).rejects.toMatchObject({
      response: { code: "AI_PROPOSAL_STALE" },
    });
    expect(
      (await pool.query("SELECT status FROM trip_ai_proposals WHERE id = $1", [staleProposal])).rows[0].status,
    ).toBe("stale");
    const staleDayProposal = await insertProposal(pool, ownerConversation.id, "itinerary_create", {
      dayId: secondDayId,
      endTime: null,
      kind: "activity",
      notes: null,
      startTime: null,
      title: "Missing Day",
      type: "itinerary_create",
    });
    await pool.query("DELETE FROM trip_days WHERE id = $1", [secondDayId]);
    await expect(proposals.apply(ownerId, tripId, staleDayProposal)).rejects.toMatchObject({
      response: { code: "AI_PROPOSAL_STALE" },
    });
    expect(
      (await pool.query("SELECT status FROM trip_ai_proposals WHERE id = $1", [staleDayProposal])).rows[0].status,
    ).toBe("stale");

    const dismissId = await insertProposal(pool, ownerConversation.id, "itinerary_create", {
      dayId: firstDayId,
      endTime: null,
      kind: "activity",
      notes: null,
      startTime: null,
      title: "Optional stop",
      type: "itinerary_create",
    });
    await expect(proposals.dismiss(viewerId, tripId, dismissId)).rejects.toMatchObject({
      response: { code: "AI_PROPOSAL_NOT_FOUND" },
    });
    await expect(proposals.dismiss(ownerId, tripId, dismissId)).resolves.toMatchObject({
      status: "dismissed",
    });
    await expect(proposals.apply(ownerId, tripId, dismissId)).rejects.toMatchObject({
      response: { code: "AI_PROPOSAL_NOT_PENDING" },
    });
  });
});

async function insertCompletedTurn(pool: Pool, conversationId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO trip_ai_turns
      (conversation_id, status, user_content, assistant_content, prompt_version, completed_at)
     VALUES ($1, 'completed', 'Request', 'Response', '1', now())
     RETURNING id`,
    [conversationId],
  );
  return result.rows[0]!.id;
}

async function insertProposal(
  pool: Pool,
  conversationId: string,
  type: "itinerary_create" | "itinerary_update" | "itinerary_move",
  payload: object,
): Promise<string> {
  const turnId = await insertCompletedTurn(pool, conversationId);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO trip_ai_proposals (turn_id, type, payload)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id`,
    [turnId, type, JSON.stringify(payload)],
  );
  return result.rows[0]!.id;
}
