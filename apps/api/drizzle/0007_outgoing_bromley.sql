CREATE TYPE "public"."trip_route_mode" AS ENUM('walking', 'cycling', 'driving');--> statement-breakpoint
CREATE TABLE "trip_route_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"from_item_id" uuid NOT NULL,
	"to_item_id" uuid NOT NULL,
	"mode" "trip_route_mode" NOT NULL,
	"distance_meters" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"geometry" jsonb NOT NULL,
	"origin_latitude" double precision NOT NULL,
	"origin_longitude" double precision NOT NULL,
	"destination_latitude" double precision NOT NULL,
	"destination_longitude" double precision NOT NULL,
	"provider" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_route_segments_trip_pair_unique" UNIQUE("trip_id","from_item_id","to_item_id"),
	CONSTRAINT "trip_route_segments_different_endpoints_check" CHECK ("trip_route_segments"."from_item_id" <> "trip_route_segments"."to_item_id"),
	CONSTRAINT "trip_route_segments_distance_nonnegative_check" CHECK ("trip_route_segments"."distance_meters" >= 0),
	CONSTRAINT "trip_route_segments_duration_nonnegative_check" CHECK ("trip_route_segments"."duration_seconds" >= 0),
	CONSTRAINT "trip_route_segments_origin_latitude_range_check" CHECK ("trip_route_segments"."origin_latitude" between -90 and 90),
	CONSTRAINT "trip_route_segments_origin_longitude_range_check" CHECK ("trip_route_segments"."origin_longitude" between -180 and 180),
	CONSTRAINT "trip_route_segments_destination_latitude_range_check" CHECK ("trip_route_segments"."destination_latitude" between -90 and 90),
	CONSTRAINT "trip_route_segments_destination_longitude_range_check" CHECK ("trip_route_segments"."destination_longitude" between -180 and 180),
	CONSTRAINT "trip_route_segments_provider_check" CHECK ("trip_route_segments"."provider" = 'openrouteservice')
);
--> statement-breakpoint
ALTER TABLE "trip_route_segments" ADD CONSTRAINT "trip_route_segments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_route_segments" ADD CONSTRAINT "trip_route_segments_from_item_id_itinerary_items_id_fk" FOREIGN KEY ("from_item_id") REFERENCES "public"."itinerary_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_route_segments" ADD CONSTRAINT "trip_route_segments_to_item_id_itinerary_items_id_fk" FOREIGN KEY ("to_item_id") REFERENCES "public"."itinerary_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_route_segments_from_item_idx" ON "trip_route_segments" USING btree ("from_item_id");--> statement-breakpoint
CREATE INDEX "trip_route_segments_to_item_idx" ON "trip_route_segments" USING btree ("to_item_id");