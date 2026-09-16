CREATE TABLE "trip_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"date" date NOT NULL,
	"destination_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_days_trip_id_date_unique" UNIQUE("trip_id","date")
);
--> statement-breakpoint
CREATE TABLE "trip_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_destinations_trip_id_id_unique" UNIQUE("trip_id","id"),
	CONSTRAINT "trip_destinations_name_not_blank_check" CHECK (length(btrim("trip_destinations"."name")) > 0),
	CONSTRAINT "trip_destinations_position_nonnegative_check" CHECK ("trip_destinations"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "trip_days" ADD CONSTRAINT "trip_days_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_days" ADD CONSTRAINT "trip_days_trip_destination_fk" FOREIGN KEY ("trip_id","destination_id") REFERENCES "public"."trip_destinations"("trip_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_destinations" ADD CONSTRAINT "trip_destinations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_days_trip_destination_idx" ON "trip_days" USING btree ("trip_id","destination_id");--> statement-breakpoint
CREATE INDEX "trip_destinations_trip_position_idx" ON "trip_destinations" USING btree ("trip_id","position","id");--> statement-breakpoint
INSERT INTO "trip_days" ("trip_id", "date")
SELECT "trips"."id", "generated_day"::date
FROM "trips"
CROSS JOIN LATERAL generate_series(
	"trips"."starts_on"::timestamp,
	"trips"."ends_on"::timestamp,
	interval '1 day'
) AS "generated_day"
WHERE "trips"."starts_on" IS NOT NULL
	AND "trips"."ends_on" IS NOT NULL;
