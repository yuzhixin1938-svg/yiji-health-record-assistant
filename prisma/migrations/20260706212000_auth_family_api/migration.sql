-- CreateTable
CREATE TABLE "sms_verification_codes" (
    "id" TEXT NOT NULL,
    "phone_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_invitations" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "invited_by_id" TEXT NOT NULL,
    "invitee_phone_hash" TEXT,
    "role" "MemberAccessRole" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sms_verification_codes_phone_hash_purpose_created_at_idx" ON "sms_verification_codes"("phone_hash", "purpose", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "member_invitations_token_hash_key" ON "member_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "member_invitations_member_id_idx" ON "member_invitations"("member_id");

-- CreateIndex
CREATE INDEX "member_invitations_invited_by_id_idx" ON "member_invitations"("invited_by_id");

-- CreateIndex
CREATE INDEX "member_invitations_invitee_phone_hash_idx" ON "member_invitations"("invitee_phone_hash");

-- AddForeignKey
ALTER TABLE "member_invitations" ADD CONSTRAINT "member_invitations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_invitations" ADD CONSTRAINT "member_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
