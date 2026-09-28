CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce("title", '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce("place_name", '') || ' ' || coalesce("place_address", '')), 'B') || setweight(to_tsvector('simple'::regconfig, coalesce("notes", '')), 'D')) STORED;--> statement-breakpoint
ALTER TABLE "reservation_transport_details" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce("service_number", '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce("operator_name", '') || ' ' || coalesce("origin_name", '') || ' ' || coalesce("destination_name", '')), 'B')) STORED;--> statement-breakpoint
ALTER TABLE "trip_destinations" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce("name", '')), 'A')) STORED;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce("title", '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce("original_file_name", '')), 'B')) STORED;--> statement-breakpoint
ALTER TABLE "trip_expenses" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce("title", '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce("notes", '')), 'D')) STORED;--> statement-breakpoint
ALTER TABLE "trip_reservations" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce("title", '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce("provider_name", '') || ' ' || coalesce("location_name", '')), 'B') || setweight(to_tsvector('simple'::regconfig, coalesce("notes", '')), 'D')) STORED;--> statement-breakpoint
CREATE INDEX "itinerary_items_search_vector_idx" ON "itinerary_items" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "itinerary_items_title_trgm_idx" ON "itinerary_items" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "itinerary_items_place_name_trgm_idx" ON "itinerary_items" USING gin ("place_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "reservation_transport_search_vector_idx" ON "reservation_transport_details" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "reservation_transport_service_number_trgm_idx" ON "reservation_transport_details" USING gin ("service_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "trip_destinations_search_vector_idx" ON "trip_destinations" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "trip_destinations_name_trgm_idx" ON "trip_destinations" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "trip_documents_search_vector_idx" ON "trip_documents" USING gin ("search_vector") WHERE "trip_documents"."status" = 'ready';--> statement-breakpoint
CREATE INDEX "trip_documents_title_trgm_idx" ON "trip_documents" USING gin ("title" gin_trgm_ops) WHERE "trip_documents"."status" = 'ready';--> statement-breakpoint
CREATE INDEX "trip_documents_file_name_trgm_idx" ON "trip_documents" USING gin ("original_file_name" gin_trgm_ops) WHERE "trip_documents"."status" = 'ready';--> statement-breakpoint
CREATE INDEX "trip_expenses_search_vector_idx" ON "trip_expenses" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "trip_expenses_title_trgm_idx" ON "trip_expenses" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "trip_reservations_search_vector_idx" ON "trip_reservations" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "trip_reservations_title_trgm_idx" ON "trip_reservations" USING gin ("title" gin_trgm_ops);
