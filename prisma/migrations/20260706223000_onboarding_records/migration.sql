-- CreateEnum
CREATE TYPE "MedicalRecordStatus" AS ENUM ('PENDING_REVIEW', 'ARCHIVED');

-- AlterTable
ALTER TABLE "member_profiles" ADD COLUMN "gender" TEXT,
ADD COLUMN "health_concerns" JSONB,
ADD COLUMN "allergy_note" TEXT,
ADD COLUMN "chronic_disease_note" TEXT,
ADD COLUMN "medication_status" TEXT,
ADD COLUMN "follow_up_plan_status" TEXT,
ADD COLUMN "profile_completed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "medical_records" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "visit_date" DATE,
    "institution" TEXT,
    "health_concern" TEXT,
    "status" "MedicalRecordStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "extracted_fields" JSONB,
    "reviewed_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_record_files" (
    "id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_record_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medical_records_member_id_status_created_at_idx" ON "medical_records"("member_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "medical_records_uploaded_by_id_idx" ON "medical_records"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "medical_record_files_record_id_idx" ON "medical_record_files"("record_id");

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_record_files" ADD CONSTRAINT "medical_record_files_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "medical_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
