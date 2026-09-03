import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AuthService } from "../src/auth/auth.service.js";
import { sha256 } from "../src/auth/token-utils.js";

describe("auth service", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("creates mock SMS challenges without storing the plain code", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.SMS_PROVIDER;
    let created: { phoneHash: string; codeHash: string; expiresAt: Date } | null = null;
    const auth = new AuthService({
      smsVerificationCode: {
        count: async () => 0,
        create: async ({ data }: { data: typeof created }) => {
          created = data;
        },
      },
    } as never);

    const result = await auth.sendSms("13800138000");

    assert.match(result.mockCode, /^\d{6}$/);
    assert.ok(created);
    assert.equal(created.phoneHash, sha256("13800138000"));
    assert.notEqual(created.codeHash, result.mockCode);
    assert.ok(created.expiresAt > new Date());
  });

  it("does not expose SMS codes in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.SMS_PROVIDER = "webhook";
    process.env.SMS_WEBHOOK_URL = "https://sms.example/send";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;
    let created: { phoneHash: string; codeHash: string; expiresAt: Date } | null = null;
    const auth = new AuthService({
      smsVerificationCode: {
        count: async () => 0,
        create: async ({ data }: { data: typeof created }) => {
          created = data;
        },
      },
    } as never);

    try {
      const result = await auth.sendSms("13800138000");
      assert.equal("mockCode" in result, false);
      assert.ok(created);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("requires a real SMS provider in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.SMS_PROVIDER;
    const auth = new AuthService({
      smsVerificationCode: {
        count: async () => 0,
      },
    } as never);

    await assert.rejects(() => auth.sendSms("13800138000"), /短信服务未配置/);
  });

  it("creates email login challenges without storing the plain code in development", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.RESEND_API_KEY;
    let created: { phoneHash: string; codeHash: string; expiresAt: Date; purpose: string } | null = null;
    const auth = new AuthService({
      smsVerificationCode: {
        count: async () => 0,
        create: async ({ data }: { data: typeof created }) => {
          created = data;
        },
      },
    } as never);

    const result = await auth.sendEmailCode("USER@example.com");

    assert.match(result.mockCode ?? "", /^\d{6}$/);
    assert.ok(created);
    assert.equal(created.phoneHash, sha256("user@example.com"));
    assert.equal(created.purpose, "EMAIL_LOGIN");
    assert.notEqual(created.codeHash, result.mockCode);
  });

  it("requires Resend in production for email login", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.RESEND_API_KEY;
    const auth = new AuthService({
      smsVerificationCode: {
        count: async () => 0,
      },
    } as never);

    await assert.rejects(() => auth.sendEmailCode("user@example.com"), /邮件服务未配置/);
  });

  it("validates active sessions by token hash", async () => {
    let updatedSessionId: string | null = null;
    const token = "session-token";
    const auth = new AuthService({
      session: {
        findUnique: async ({ where }: { where: { tokenHash: string } }) => {
          assert.equal(where.tokenHash, sha256(token));
          return {
            id: "session-a",
            revokedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
            user: { id: "user-a" },
          };
        },
        update: async ({ where }: { where: { id: string } }) => {
          updatedSessionId = where.id;
        },
      },
    } as never);

    assert.deepEqual(await auth.validateSession(token), {
      id: "user-a",
      sessionId: "session-a",
    });
    assert.equal(updatedSessionId, "session-a");
  });

  it("rejects revoked sessions", async () => {
    const auth = new AuthService({
      session: {
        findUnique: async () => ({
          id: "session-a",
          revokedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          user: { id: "user-a" },
        }),
      },
    } as never);

    await assert.rejects(() => auth.validateSession("session-token"), /登录已失效/);
  });
});
