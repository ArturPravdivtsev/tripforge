CREATE TYPE "public"."transport_reservation_mode" AS ENUM('flight', 'train', 'bus', 'ferry', 'other');--> statement-breakpoint
CREATE TYPE "public"."trip_reservation_kind" AS ENUM('accommodation', 'transport', 'restaurant', 'activity', 'other');--> statement-breakpoint
CREATE TYPE "public"."trip_reservation_status" AS ENUM('pending', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TABLE "reservation_transport_details" (
	"reservation_id" uuid NOT NULL,
	"mode" "transport_reservation_mode" NOT NULL,
	"operator_name" varchar(160),
	"service_number" varchar(120),
	"origin_name" varchar(200) NOT NULL,
	"destination_name" varchar(200) NOT NULL,
	CONSTRAINT "reservation_transport_details_reservation_id_pk" PRIMARY KEY("reservation_id"),
	CONSTRAINT "reservation_transport_operator_not_blank_check" CHECK ("reservation_transport_details"."operator_name" is null or length(btrim("reservation_transport_details"."operator_name")) > 0),
	CONSTRAINT "reservation_transport_service_not_blank_check" CHECK ("reservation_transport_details"."service_number" is null or length(btrim("reservation_transport_details"."service_number")) > 0),
	CONSTRAINT "reservation_transport_origin_not_blank_check" CHECK (length(btrim("reservation_transport_details"."origin_name")) > 0),
	CONSTRAINT "reservation_transport_destination_not_blank_check" CHECK (length(btrim("reservation_transport_details"."destination_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "trip_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"itinerary_item_id" uuid,
	"kind" "trip_reservation_kind" NOT NULL,
	"status" "trip_reservation_status" NOT NULL,
	"title" varchar(200) NOT NULL,
	"provider_name" varchar(160),
	"confirmation_code" varchar(120),
	"start_date" date NOT NULL,
	"start_time" time(0),
	"end_date" date,
	"end_time" time(0),
	"location_name" varchar(200),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_reservations_title_not_blank_check" CHECK (length(btrim("trip_reservations"."title")) > 0),
	CONSTRAINT "trip_reservations_provider_name_not_blank_check" CHECK ("trip_reservations"."provider_name" is null or length(btrim("trip_reservations"."provider_name")) > 0),
	CONSTRAINT "trip_reservations_confirmation_code_not_blank_check" CHECK ("trip_reservations"."confirmation_code" is null or length(btrim("trip_reservations"."confirmation_code")) > 0),
	CONSTRAINT "trip_reservations_location_name_not_blank_check" CHECK ("trip_reservations"."location_name" is null or length(btrim("trip_reservations"."location_name")) > 0),
	CONSTRAINT "trip_reservations_notes_length_check" CHECK ("trip_reservations"."notes" is null or length("trip_reservations"."notes") <= 5000),
	CONSTRAINT "trip_reservations_end_time_date_check" CHECK ("trip_reservations"."end_time" is null or "trip_reservations"."end_date" is not null),
	CONSTRAINT "trip_reservations_date_range_check" CHECK ("trip_reservations"."end_date" is null or "trip_reservations"."end_date" >= "trip_reservations"."start_date"),
	CONSTRAINT "trip_reservations_same_day_time_range_check" CHECK ("trip_reservations"."end_date" is null or "trip_reservations"."end_date" <> "trip_reservations"."start_date" or "trip_reservations"."start_time" is null or "trip_reservations"."end_time" is null or "trip_reservations"."end_time" >= "trip_reservations"."start_time")
);
--> statement-breakpoint
ALTER TABLE "reservation_transport_details" ADD CONSTRAINT "reservation_transport_details_reservation_id_trip_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."trip_reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_reservations" ADD CONSTRAINT "trip_reservations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_reservations" ADD CONSTRAINT "trip_reservations_itinerary_item_id_itinerary_items_id_fk" FOREIGN KEY ("itinerary_item_id") REFERENCES "public"."itinerary_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_reservations_trip_idx" ON "trip_reservations" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trip_reservations_itinerary_item_idx" ON "trip_reservations" USING btree ("itinerary_item_id");--> statement-breakpoint
CREATE INDEX "trip_reservations_schedule_idx" ON "trip_reservations" USING btree ("trip_id","start_date","start_time","created_at","id");