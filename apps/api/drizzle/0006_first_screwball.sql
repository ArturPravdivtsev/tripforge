ALTER TABLE "itinerary_items" ADD COLUMN "place_name" varchar(200);--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD COLUMN "place_address" varchar(500);--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD COLUMN "place_latitude" double precision;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD COLUMN "place_longitude" double precision;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD COLUMN "place_provider" varchar(32);--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD COLUMN "place_provider_ref" varchar(300);--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_place_state_check" CHECK ((
        "itinerary_items"."place_name" is null
        and "itinerary_items"."place_address" is null
        and "itinerary_items"."place_latitude" is null
        and "itinerary_items"."place_longitude" is null
        and "itinerary_items"."place_provider" is null
        and "itinerary_items"."place_provider_ref" is null
      ) or (
        "itinerary_items"."place_name" is not null
        and "itinerary_items"."place_latitude" is not null
        and "itinerary_items"."place_longitude" is not null
        and "itinerary_items"."place_provider" is not null
      ));--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_place_name_not_blank_check" CHECK ("itinerary_items"."place_name" is null or length(btrim("itinerary_items"."place_name")) > 0);--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_place_address_not_blank_check" CHECK ("itinerary_items"."place_address" is null or length(btrim("itinerary_items"."place_address")) > 0);--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_place_latitude_range_check" CHECK ("itinerary_items"."place_latitude" is null or ("itinerary_items"."place_latitude" >= -90 and "itinerary_items"."place_latitude" <= 90));--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_place_longitude_range_check" CHECK ("itinerary_items"."place_longitude" is null or ("itinerary_items"."place_longitude" >= -180 and "itinerary_items"."place_longitude" <= 180));--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_place_provider_check" CHECK ("itinerary_items"."place_provider" is null or "itinerary_items"."place_provider" = 'maptiler');--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_place_provider_ref_not_blank_check" CHECK ("itinerary_items"."place_provider_ref" is null or length(btrim("itinerary_items"."place_provider_ref")) > 0);