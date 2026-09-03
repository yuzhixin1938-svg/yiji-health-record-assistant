import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HealthService } from "../src/health/health.service.js";

type FakePrisma = {
  ping: () => Promise<void>;
};

type FakeStorage = {
  checkAliyunOssConfig: () => Promise<void>;
};

function service(
  prisma: FakePrisma,
  redisPing: () => Promise<void>,
  storage: FakeStorage = { checkAliyunOssConfig: async () => undefined },
): HealthService {
  const healthService = new HealthService(prisma as never, storage as never);
  healthService.redisPing = redisPing;
  return healthService;
}

describe("health readiness", () => {
  it("returns ok when database and redis are both reachable", async () => {
    const health = service({ ping: async () => undefined }, async () => undefined);

    assert.deepEqual(await health.readiness(), {
      status: "ok",
      checks: {
        database: "ok",
        redis: "ok",
        aliyunOss: "ok",
      },
    });
  });

  it("returns error when database is unavailable", async () => {
    const health = service(
      { ping: async () => Promise.reject(new Error("database unavailable")) },
      async () => undefined,
    );

    assert.deepEqual(await health.readiness(), {
      status: "error",
      checks: {
        database: "error",
        redis: "ok",
        aliyunOss: "ok",
      },
    });
  });

  it("returns error when redis is unavailable", async () => {
    const health = service(
      { ping: async () => undefined },
      async () => Promise.reject(new Error("redis unavailable")),
    );

    assert.deepEqual(await health.readiness(), {
      status: "error",
      checks: {
        database: "ok",
        redis: "error",
        aliyunOss: "ok",
      },
    });
  });

  it("returns error when Aliyun OSS configuration is unavailable", async () => {
    const health = service(
      { ping: async () => undefined },
      async () => undefined,
      { checkAliyunOssConfig: async () => Promise.reject(new Error("oss unavailable")) },
    );

    assert.deepEqual(await health.readiness(), {
      status: "error",
      checks: {
        database: "ok",
        redis: "ok",
        aliyunOss: "error",
      },
    });
  });
});
