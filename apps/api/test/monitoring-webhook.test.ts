import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import { scrubText } from "../src/monitoring/scrub.js";
import { ResendWebhookService } from "../src/webhooks/resend-webhook.service.js";

describe("monitoring and webhooks", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("scrubs common sensitive values before logging", () => {
    const scrubbed = scrubText("邮箱 a@example.com 手机 13800138000 Bearer abcdefghijklmnopqrstuvwxyz123456");
    assert.equal(scrubbed.includes("a@example.com"), false);
    assert.equal(scrubbed.includes("13800138000"), false);
    assert.equal(scrubbed.includes("abcdefghijklmnopqrstuvwxyz"), false);
  });

  it("accepts a valid Resend webhook signature and stores only hashed recipient", async () => {
    const secret = "test-secret";
    process.env.RESEND_WEBHOOK_SECRET = secret;
    const rawBody = Buffer.from(JSON.stringify({ type: "email.bounced", data: { email_id: "email-a", to: "user@example.com" } }));
    const id = "msg_123456789";
    const timestamp = "1785571200";
    const expected = createHmac("sha256", secret).update(`${id}.${timestamp}.${rawBody.toString("utf8")}`).digest("base64");
    let metadata: unknown = null;
    const service = new ResendWebhookService({
      record: async (input: { metadata?: unknown }) => {
        metadata = input.metadata;
      },
    } as never);

    await service.handle({
      rawBody,
      headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${expected}` },
      body: JSON.parse(rawBody.toString("utf8")),
      requestId: "request-a",
    });

    assert.deepEqual(metadata, { provider: "resend", recipientHash: "b4c9a289323b21a0" });
  });
});
