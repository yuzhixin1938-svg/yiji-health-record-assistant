-- CreateEnum
CREATE TYPE "RecognitionTaskStatus" AS ENUM ('PENDING_REVIEW', 'REVIEWED');

-- CreateTable
CREATE TABLE "recognition_tasks" (
    "id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "status" "RecognitionTaskStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "raw_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "recognition_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recognized_fields" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "field_value" TEXT,
    "user_value" TEXT,
    "source_type" TEXT NOT NULL,
    "source_text" TEXT,
    "page_number" INTEGER,
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recognized_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recognition_tasks_record_id_created_at_idx" ON "recognition_tasks"("record_id", "created_at");

-- CreateIndex
CREATE INDEX "recognized_fields_task_id_idx" ON "recognized_fields"("task_id");

-- CreateIndex
CREATE INDEX "recognized_fields_field_name_idx" ON "recognized_fields"("field_name");

-- AddForeignKey
ALTER TABLE "recognition_tasks" ADD CONSTRAINT "recognition_tasks_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "medical_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognized_fields" ADD CONSTRAINT "recognized_fields_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "recognition_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
