CREATE TYPE "public"."trip_expense_category" AS ENUM('accommodation', 'transport', 'food', 'activity', 'shopping', 'other');--> statement-breakpoint
CREATE TYPE "public"."trip_expense_split_method" AS ENUM('equal', 'custom');--> statement-breakpoint
CREATE TABLE "trip_expense_splits" (
	"expense_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_expense_splits_expense_id_user_id_pk" PRIMARY KEY("expense_id","user_id"),
	CONSTRAINT "trip_expense_splits_amount_minor_check" CHECK ("trip_expense_splits"."amount_minor" >= 0 and "trip_expense_splits"."amount_minor" <= 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "trip_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"reservation_id" uuid,
	"title" varchar(200) NOT NULL,
	"category" "trip_expense_category" NOT NULL,
	"spent_on" date NOT NULL,
	"currency" varchar(3) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"paid_by_user_id" uuid NOT NULL,
	"split_method" "trip_expense_split_method" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_expenses_title_not_blank_check" CHECK (length(btrim("trip_expenses"."title")) > 0),
	CONSTRAINT "trip_expenses_currency_check" CHECK ("trip_expenses"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "trip_expenses_amount_minor_check" CHECK ("trip_expenses"."amount_minor" > 0 and "trip_expenses"."amount_minor" <= 9007199254740991),
	CONSTRAINT "trip_expenses_notes_length_check" CHECK ("trip_expenses"."notes" is null or length("trip_expenses"."notes") <= 5000)
);
--> statement-breakpoint
ALTER TABLE "trip_expense_splits" ADD CONSTRAINT "trip_expense_splits_expense_id_trip_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."trip_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_expense_splits" ADD CONSTRAINT "trip_expense_splits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_reservation_id_trip_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."trip_reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_expense_splits_user_idx" ON "trip_expense_splits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trip_expenses_trip_idx" ON "trip_expenses" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trip_expenses_reservation_idx" ON "trip_expenses" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "trip_expenses_payer_idx" ON "trip_expenses" USING btree ("paid_by_user_id");--> statement-breakpoint
CREATE INDEX "trip_expenses_list_idx" ON "trip_expenses" USING btree ("trip_id","spent_on","created_at","id");