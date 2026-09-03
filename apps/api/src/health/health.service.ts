import { Injectable } from "@nestjs/common";
import { loadEnvironment } from "../config/environment.js";
import { PrismaService } from "../database/prisma.service.js";
import { RecordFileStorageService } from "../records/record-file-storage.service.js";
import { pingRedis } from "./redis-health.js";

export type ReadinessCheckStatus = "ok" | "error";

export type ReadinessResponse = {
  status: ReadinessCheckStatus;
  checks: {
    database: ReadinessCheckStatus;
    redis: ReadinessCheckStatus;
    aliyunOss: ReadinessCheckStatus;
  };
};

@Injectable()
export class HealthService {
  private readonly environment = loadEnvironment();
  redisPing: (redisUrl: string) => Promise<void> = pingRedis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly recordFileStorage: RecordFileStorageService,
  ) {}

  async readiness(): Promise<ReadinessResponse> {
    const [database, redis, aliyunOss] = await Promise.all([
      this.check(() => this.prisma.ping()),
      this.check(() => this.redisPing(this.environment.REDIS_URL)),
      this.check(() => this.recordFileStorage.checkAliyunOssConfig()),
    ]);

    return {
      status: database === "ok" && redis === "ok" && aliyunOss === "ok" ? "ok" : "error",
      checks: { database, redis, aliyunOss },
    };
  }

  private async check(fn: () => Promise<void>): Promise<ReadinessCheckStatus> {
    try {
      await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Readiness check timed out")), 2_500),
        ),
      ]);
      return "ok";
    } catch {
      return "error";
    }
  }
}
