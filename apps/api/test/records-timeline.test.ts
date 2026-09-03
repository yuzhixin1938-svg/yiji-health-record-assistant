import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RecordsService } from "../src/records/records.service.js";

function service(records: unknown[], captured: unknown[] = []): RecordsService {
  const prisma = {
    memberAccess: {
      findUnique: async () => ({
        memberId: "member-a",
        userId: "user-a",
        role: "MANAGER",
        status: "ACTIVE",
        expiresAt: null,
      }),
    },
    medicalRecord: {
      findMany: async (args: unknown) => {
        captured.push(args);
        return records;
      },
    },
  };
  return new RecordsService(prisma as never, {} as never, {} as never);
}

describe("records timeline", () => {
  it("returns timeline items from records in query order", async () => {
    const records = [
      {
        id: "record-new",
        title: "牙科复查",
        recordType: "门诊病历",
        visitDate: new Date("2026-08-02T00:00:00.000Z"),
        institution: "口腔医院",
        healthConcern: "牙齿",
        files: [{ id: "file-a" }],
      },
      {
        id: "record-old",
        title: "胃疼问诊",
        recordType: "门诊病历",
        visitDate: new Date("2026-07-01T00:00:00.000Z"),
        institution: "社区医院",
        healthConcern: "胃疼",
        files: [],
      },
    ];

    const result = await service(records).timeline("user-a", "member-a");

    assert.deepEqual(result, {
      memberId: "member-a",
      mode: "all",
      healthConcern: null,
      items: [
        {
          id: "record-new",
          date: "2026-08-02",
          happened: "牙科复查",
          healthConcern: "牙齿",
          recordType: "门诊病历",
          institution: "口腔医院",
          recordIds: ["record-new"],
          fileCount: 1,
          canAddToVisitPack: true,
        },
        {
          id: "record-old",
          date: "2026-07-01",
          happened: "胃疼问诊",
          healthConcern: "胃疼",
          recordType: "门诊病历",
          institution: "社区医院",
          recordIds: ["record-old"],
          fileCount: 0,
          canAddToVisitPack: true,
        },
      ],
    });
  });

  it("adds category filter when health concern is provided", async () => {
    const captured: unknown[] = [];

    const result = await service([], captured).timeline("user-a", "member-a", "牙齿");

    assert.equal(result.mode, "category");
    assert.equal(result.healthConcern, "牙齿");
    assert.deepEqual((captured[0] as { where: { healthConcern: string } }).where.healthConcern, "牙齿");
  });
});
