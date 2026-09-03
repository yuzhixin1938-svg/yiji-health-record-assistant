import { Module } from "@nestjs/common";
import { AccountController } from "./account/account.controller.js";
import { AccountService } from "./account/account.service.js";
import { AgentTodosController } from "./agent/agent-todos.controller.js";
import { AgentTodosService } from "./agent/agent-todos.service.js";
import { AuditService } from "./audit/audit.service.js";
import { AuthController } from "./auth/auth.controller.js";
import { AuthGuard } from "./auth/auth.guard.js";
import { AuthService } from "./auth/auth.service.js";
import { FamilyController } from "./family/family.controller.js";
import { FamilyService } from "./family/family.service.js";
import { HealthController } from "./health/health.controller.js";
import { HealthService } from "./health/health.service.js";
import { MedicinesController } from "./medicines/medicines.controller.js";
import { MedicinesService } from "./medicines/medicines.service.js";
import { MetricsController } from "./metrics/metrics.controller.js";
import { MetricsService } from "./metrics/metrics.service.js";
import { MonitoringController } from "./monitoring/monitoring.controller.js";
import { MonitoringService } from "./monitoring/monitoring.service.js";
import { OnboardingController } from "./onboarding/onboarding.controller.js";
import { OnboardingService } from "./onboarding/onboarding.service.js";
import { MemberAccessService } from "./permissions/member-access.service.js";
import { PrismaService } from "./database/prisma.service.js";
import { RecordsController } from "./records/records.controller.js";
import { RecordFileStorageService } from "./records/record-file-storage.service.js";
import { RecognitionService } from "./records/recognition.service.js";
import { RecordsService } from "./records/records.service.js";
import { TodosController } from "./todos/todos.controller.js";
import { TodosService } from "./todos/todos.service.js";
import { VisitPacksController, VisitPackSharesPublicController } from "./visit-packs/visit-packs.controller.js";
import { VisitPackPdfService } from "./visit-packs/visit-pack-pdf.service.js";
import { VisitPacksService } from "./visit-packs/visit-packs.service.js";
import { ResendWebhookService } from "./webhooks/resend-webhook.service.js";
import { WebhooksController } from "./webhooks/webhooks.controller.js";

@Module({
  controllers: [
    HealthController,
    AgentTodosController,
    AuthController,
    AccountController,
    FamilyController,
    OnboardingController,
    RecordsController,
    MedicinesController,
    MetricsController,
    MonitoringController,
    TodosController,
    VisitPacksController,
    VisitPackSharesPublicController,
    WebhooksController,
  ],
  providers: [
    PrismaService,
    AgentTodosService,
    HealthService,
    AuthService,
    AccountService,
    AuthGuard,
    FamilyService,
    OnboardingService,
    RecordFileStorageService,
    RecognitionService,
    RecordsService,
    MemberAccessService,
    MedicinesService,
    MetricsService,
    MonitoringService,
    TodosService,
    VisitPacksService,
    VisitPackPdfService,
    AuditService,
    ResendWebhookService,
  ],
})
export class AppModule {}
