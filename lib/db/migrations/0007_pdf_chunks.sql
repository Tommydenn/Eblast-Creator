CREATE TABLE IF NOT EXISTS "pdf_chunks" (
	"upload_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"total_chunks" integer NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pdf_chunks_upload_id_chunk_index_pk" PRIMARY KEY("upload_id","chunk_index")
);
