-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('OPEN', 'DONE');

-- CreateEnum
CREATE TYPE "VisitPackStatus" AS ENUM ('DRAFT', 'GENERATED');

-- CreateTable
CREATE TABLE "medicines" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specification" TEXT,
    "purpose_note" TEXT,
    "dosage_instruction" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "current_quantity" DOUBLE PRECISION,
    "quantity_unit" TEXT,
    "expires_on" DATE,
    "storage_location" TEXT,
    "reminder_enabled" BOOLEAN NOT NULL DEFAULT false,
    "stopped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_schedules" (
    "id" TEXT NOT NULL,
    "medicine_id" TEXT NOT NULL,
    "time_label" TEXT NOT NULL,
    "dose_text" TEXT NOT NULL,
    "reminder_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_records" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "metric_type" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "unit" TEXT NOT NULL,
    "measured_at" TIMESTAMP(3) NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_record_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todo_items" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "status" "TodoStatus" NOT NULL DEFAULT 'OPEN',
    "source_type" TEXT,
    "source_id" TEXT,
    "metadata" JSONB,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "todo_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_packs" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "visit_reason" TEXT NOT NULL,
    "recent_symptoms" TEXT,
    "questions" TEXT,
    "selected_record_ids" JSONB NOT NULL,
    "status" "VisitPackStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB,
    "generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visit_packs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medicines_member_id_stopped_at_idx" ON "medicines"("member_id", "stopped_at");

-- CreateIndex
CREATE INDEX "medicines_created_by_id_idx" ON "medicines"("created_by_id");

-- CreateIndex
CREATE INDEX "medication_schedules_medicine_id_idx" ON "medication_schedules"("medicine_id");

-- CreateIndex
CREATE INDEX "metric_records_member_id_metric_type_measured_at_idx" ON "metric_records"("member_id", "metric_type", "measured_at");

-- CreateIndex
CREATE INDEX "metric_records_created_by_id_idx" ON "metric_records"("created_by_id");

-- CreateIndex
CREATE INDEX "todo_items_member_id_status_due_at_idx" ON "todo_items"("member_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "todo_items_created_by_id_idx" ON "todo_items"("created_by_id");

-- CreateIndex
CREATE INDEX "visit_packs_member_id_status_created_at_idx" ON "visit_packs"("member_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "visit_packs_created_by_id_idx" ON "visit_packs"("created_by_id");

-- AddForeignKey
ALTER TABLE "medicines" ADD CONSTRAINT "medicines_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicines" ADD CONSTRAINT "medicines_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_schedules" ADD CONSTRAINT "medication_schedules_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "medicines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_records" ADD CONSTRAINT "metric_records_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_records" ADD CONSTRAINT "metric_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_packs" ADD CONSTRAINT "visit_packs_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_packs" ADD CONSTRAINT "visit_packs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
