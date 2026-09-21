CREATE TYPE "public"."trip_document_kind" AS ENUM('ticket', 'booking', 'receipt', 'image', 'other');--> statement-breakpoint
CREATE TYPE "public"."trip_document_status" AS ENUM('pending', 'ready');--> statement-breakpoint
CREATE TABLE "trip_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trip_id" uuid NOT NULL,
	"itinerary_item_id" uuid,
	"reservation_id" uuid,
	"expense_id" uuid,
	"kind" "trip_document_kind" NOT NULL,
	"status" "trip_document_status" DEFAULT 'pending' NOT NULL,
	"title" varchar(200) NOT NULL,
	"original_file_name" varchar(255) NOT NULL,
	"content_type" varchar(64) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"etag" varchar(255),
	"uploaded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	CONSTRAINT "trip_documents_title_not_blank_check" CHECK (length(btrim("trip_documents"."title")) > 0),
	CONSTRAINT "trip_documents_file_name_not_blank_check" CHECK (length(btrim("trip_documents"."original_file_name")) > 0),
	CONSTRAINT "trip_documents_content_type_check" CHECK ("trip_documents"."content_type" in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "trip_documents_size_bytes_check" CHECK ("trip_documents"."size_bytes" >= 1 and "trip_documents"."size_bytes" <= 26214400),
	CONSTRAINT "trip_documents_link_exclusive_check" CHECK (num_nonnulls("trip_documents"."itinerary_item_id", "trip_documents"."reservation_id", "trip_documents"."expense_id") <= 1),
	CONSTRAINT "trip_documents_ready_state_check" CHECK (("trip_documents"."status" = 'pending' and "trip_documents"."ready_at" is null) or ("trip_documents"."status" = 'ready' and "trip_documents"."ready_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_itinerary_item_id_itinerary_items_id_fk" FOREIGN KEY ("itinerary_item_id") REFERENCES "public"."itinerary_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_reservation_id_trip_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."trip_reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_expense_id_trip_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."trip_expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_documents_trip_created_idx" ON "trip_documents" USING btree ("trip_id","created_at","id");--> statement-breakpoint
CREATE INDEX "trip_documents_itinerary_item_idx" ON "trip_documents" USING btree ("itinerary_item_id");--> statement-breakpoint
CREATE INDEX "trip_documents_reservation_idx" ON "trip_documents" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "trip_documents_expense_idx" ON "trip_documents" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "trip_documents_uploader_idx" ON "trip_documents" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_documents_storage_key_unique" ON "trip_documents" USING btree ("storage_key");