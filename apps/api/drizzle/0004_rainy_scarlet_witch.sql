CREATE TYPE "public"."itinerary_item_kind" AS ENUM('activity', 'food', 'transport', 'accommodation', 'other');--> statement-breakpoint
CREATE TABLE "itinerary_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_day_id" uuid NOT NULL,
	"kind" "itinerary_item_kind" NOT NULL,
	"title" varchar(200) NOT NULL,
	"start_time" time(0),
	"notes" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itinerary_items_title_not_blank_check" CHECK (length(btrim("itinerary_items"."title")) > 0),
	CONSTRAINT "itinerary_items_notes_length_check" CHECK ("itinerary_items"."notes" is null or length("itinerary_items"."notes") <= 5000),
	CONSTRAINT "itinerary_items_position_nonnegative_check" CHECK ("itinerary_items"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_trip_day_id_trip_days_id_fk" FOREIGN KEY ("trip_day_id") REFERENCES "public"."trip_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "itinerary_items_day_position_idx" ON "itinerary_items" USING btree ("trip_day_id","position","id");