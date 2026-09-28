CREATE TYPE "public"."user_notification_type" AS ENUM('trip_shared', 'trip_role_changed', 'trip_access_revoked', 'trip_deleted', 'reservation_added', 'expense_added', 'document_ready');--> statement-breakpoint
CREATE TABLE "user_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "user_notification_type" NOT NULL,
	"trip_id" uuid,
	"trip_name_snapshot" varchar(200) NOT NULL,
	"actor_user_id" uuid,
	"actor_name_snapshot" varchar(100),
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_notifications_trip_name_not_blank_check" CHECK (length(btrim("user_notifications"."trip_name_snapshot")) > 0),
	CONSTRAINT "user_notifications_actor_name_not_blank_check" CHECK ("user_notifications"."actor_name_snapshot" is null or length(btrim("user_notifications"."actor_name_snapshot")) > 0),
	CONSTRAINT "user_notifications_payload_object_check" CHECK (jsonb_typeof("user_notifications"."payload") = 'object')
);
--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_notifications_inbox_idx" ON "user_notifications" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_notifications_unread_idx" ON "user_notifications" USING btree ("user_id") WHERE "user_notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "user_notifications_trip_id_idx" ON "user_notifications" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "user_notifications_actor_user_id_idx" ON "user_notifications" USING btree ("actor_user_id");