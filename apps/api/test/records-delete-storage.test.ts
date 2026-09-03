import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MedicalRecordStatus } from "../src/generated/prisma/enums.js";
import { RecordsService } from "../src/records/records.service.js";

describe("records delete storage", () => {
  it("marks record deleted and removes original files from storage", async () => {
    const deletedStoragePaths: string[] = [];
    const record = {
      id: "record-a",
      memberId: "member-a",
      status: MedicalRecordStatus.ARCHIVED,
      files: [
        { id: "file-a", storagePath: "oss://bucket/medical-records/member-a/a.jpg" },
        { id: "file-b", storagePath: "oss://bucket/medical-records/member-a/b.pdf" },
      ],
      recognitionTasks: [],
    };
    let updateArgs: unknown;
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
        findUnique: async () => record,
        update: async (args: unknown) => {
          updateArgs = args;
          return { ...record, status: MedicalRecordStatus.DELETED };
        },
      },
    };
    const fileStorage = {
      delete: async (storagePath: string) => {
        deletedStoragePaths.push(storagePath);
      },
    };
    const service = new RecordsService(prisma as never, {} as never, fileStorage as never);

    const result = await service.deleteRecord("user-a", "record-a");

    assert.equal(result.status, MedicalRecordStatus.DELETED);
    assert.deepEqual((updateArgs as { data: { status: MedicalRecordStatus } }).data, {
      status: MedicalRecordStatus.DELETED,
    });
    assert.deepEqual(deletedStoragePaths, [
      "oss://bucket/medical-records/member-a/a.jpg",
      "oss://bucket/medical-records/member-a/b.pdf",
    ]);
  });
});
