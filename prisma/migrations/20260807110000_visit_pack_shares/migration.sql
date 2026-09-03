CREATE TABLE "visit_pack_shares" (
    "id" TEXT NOT NULL,
    "visit_pack_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "last_accessed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visit_pack_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "visit_pack_shares_token_hash_key" ON "visit_pack_shares"("token_hash");

CREATE INDEX "visit_pack_shares_visit_pack_id_revoked_at_expires_at_idx" ON "visit_pack_shares"("visit_pack_id", "revoked_at", "expires_at");

ALTER TABLE "visit_pack_shares" ADD CONSTRAINT "visit_pack_shares_visit_pack_id_fkey" FOREIGN KEY ("visit_pack_id") REFERENCES "visit_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
