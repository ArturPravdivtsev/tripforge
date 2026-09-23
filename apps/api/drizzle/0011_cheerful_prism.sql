CREATE TYPE "public"."storage_cleanup_reason" AS ENUM('document_delete', 'trip_delete', 'stale_pending');--> statement-breakpoint
CREATE TABLE "storage_cleanup_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"reason" "storage_cleanup_reason" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_dispatched_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "storage_cleanup_outbox_storage_key_not_blank_check" CHECK (length(btrim("storage_cleanup_outbox"."storage_key")) > 0),
	CONSTRAINT "storage_cleanup_outbox_terminal_state_check" CHECK ("storage_cleanup_outbox"."completed_at" is null or "storage_cleanup_outbox"."failed_at" is null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "storage_cleanup_outbox_storage_key_unique" ON "storage_cleanup_outbox" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "storage_cleanup_outbox_incomplete_created_idx" ON "storage_cleanup_outbox" USING btree ("created_at","id") WHERE "storage_cleanup_outbox"."completed_at" is null;