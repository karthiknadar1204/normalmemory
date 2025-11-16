CREATE TABLE "user_databases" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"database_url" varchar(1024) NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_databases" ADD CONSTRAINT "user_databases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_databases_user_id_unique" ON "user_databases" USING btree ("user_id");