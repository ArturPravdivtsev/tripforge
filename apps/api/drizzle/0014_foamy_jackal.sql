CREATE TYPE "public"."trip_ai_proposal_status" AS ENUM('pending', 'applied', 'dismissed', 'stale');--> statement-breakpoint
CREATE TYPE "public"."trip_ai_proposal_type" AS ENUM('itinerary_create', 'itinerary_update', 'itinerary_move');--> statement-breakpoint
CREATE TYPE "public"."trip_ai_turn_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "trip_ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_ai_conversations_title_not_blank_check" CHECK (length(btrim("trip_ai_conversations"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "trip_ai_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turn_id" uuid NOT NULL,
	"type" "trip_ai_proposal_type" NOT NULL,
	"status" "trip_ai_proposal_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	CONSTRAINT "trip_ai_proposals_payload_object_check" CHECK (jsonb_typeof("trip_ai_proposals"."payload") = 'object')
);
--> statement-breakpoint
CREATE TABLE "trip_ai_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"status" "trip_ai_turn_status" NOT NULL,
	"user_content" varchar(4000) NOT NULL,
	"assistant_content" text,
	"model" varchar(100),
	"prompt_version" varchar(32) NOT NULL,
	"input_tokens" integer,
	"cached_input_tokens" integer,
	"output_tokens" integer,
	"reasoning_tokens" integer,
	"error_code" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "trip_ai_turns_user_content_not_blank_check" CHECK (length(btrim("trip_ai_turns"."user_content")) > 0),
	CONSTRAINT "trip_ai_turns_tokens_nonnegative_check" CHECK (coalesce("trip_ai_turns"."input_tokens", 0) >= 0 and coalesce("trip_ai_turns"."cached_input_tokens", 0) >= 0 and coalesce("trip_ai_turns"."output_tokens", 0) >= 0 and coalesce("trip_ai_turns"."reasoning_tokens", 0) >= 0)
);
--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD COLUMN "end_time" time(0);--> statement-breakpoint
ALTER TABLE "trip_ai_conversations" ADD CONSTRAINT "trip_ai_conversations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_ai_conversations" ADD CONSTRAINT "trip_ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_ai_proposals" ADD CONSTRAINT "trip_ai_proposals_turn_id_trip_ai_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."trip_ai_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_ai_turns" ADD CONSTRAINT "trip_ai_turns_conversation_id_trip_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."trip_ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_ai_conversations_owner_updated_idx" ON "trip_ai_conversations" USING btree ("trip_id","user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "trip_ai_proposals_turn_idx" ON "trip_ai_proposals" USING btree ("turn_id","created_at");--> statement-breakpoint
CREATE INDEX "trip_ai_turns_conversation_created_idx" ON "trip_ai_turns" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_ai_turns_one_pending_idx" ON "trip_ai_turns" USING btree ("conversation_id") WHERE "trip_ai_turns"."status" = 'pending';