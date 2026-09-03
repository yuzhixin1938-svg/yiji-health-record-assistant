import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GUARDS_METADATA } from "@nestjs/common/constants.js";
import { AuthGuard } from "../src/auth/auth.guard.js";
import { AgentTodosController } from "../src/agent/agent-todos.controller.js";
import { AgentTodosService } from "../src/agent/agent-todos.service.js";

function service(overrides: {
  records?: unknown[];
  visitPacks?: unknown[];
  existingTodo?: { id: string } | null;
  created?: unknown[];
  updated?: unknown[];
} = {}) {
  const created = overrides.created ?? [];
  const updated = overrides.updated ?? [];
  const prisma = {
    medicalRecord: {
      findMany: async () => overrides.records ?? [],
    },
    visitPack: {
      findMany: async () => overrides.visitPacks ?? [],
    },
    todoItem: {
      findFirst: async () => overrides.existingTodo ?? null,
      create: async ({ data }: { data: unknown }) => {
        created.push(data);
        return { id: "todo-created", ...(data as object) };
      },
      update: async ({ where, data }: { where: { id: string }; data: unknown }) => {
        updated.push({ where, data });
        return { id: where.id, ...(data as object) };
      },
    },
  };
  const access = {
    resolveMemberId: async (_userId: string, memberId?: string) => memberId ?? "member-a",
    assertCan: async () => undefined,
  };
  return { agentTodos: new AgentTodosService(prisma as never, access as never), created, updated };
}

describe("agent todos service", () => {
  it("creates review todos from incomplete records", async () => {
    const { agentTodos, created } = service({
      records: [{ id: "record-a", title: "牙科病历", visitDate: null, institution: null, healthConcern: "牙齿" }],
    });

    const result = await agentTodos.refresh("user-a", "member-a");

    assert.equal(result.createdOrUpdated, 1);
    assert.equal(created.length, 1);
    assert.equal((created[0] as { sourceId: string }).sourceId, "record-a");
  });

  it("updates an existing open agent todo instead of creating a duplicate", async () => {
    const { agentTodos, created, updated } = service({
      records: [{ id: "record-a", title: "牙科病历", visitDate: null, institution: null, healthConcern: null }],
      existingTodo: { id: "todo-a" },
    });

    const result = await agentTodos.refresh("user-a", "member-a");

    assert.equal(result.createdOrUpdated, 1);
    assert.equal(created.length, 0);
    assert.equal(updated.length, 1);
    assert.deepEqual((updated[0] as { where: { id: string } }).where, { id: "todo-a" });
  });

  it("creates visit pack todos when recent status is missing", async () => {
    const { agentTodos, created } = service({
      visitPacks: [{ id: "pack-a", recentSymptoms: "" }],
    });

    const result = await agentTodos.refresh("user-a", "member-a");

    assert.equal(result.createdOrUpdated, 1);
    assert.equal((created[0] as { sourceType: string }).sourceType, "visit_pack");
  });

  it("requires the auth guard on the refresh controller", () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AgentTodosController);

    assert.deepEqual(guards, [AuthGuard]);
  });
});
