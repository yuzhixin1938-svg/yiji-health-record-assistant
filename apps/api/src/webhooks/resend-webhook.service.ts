import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AuditService } from "../audit/audit.service.js";
import { sha256Short } from "../monitoring/scrub.js";

type ResendWebhookPayload = {
  type?: string;
  data?: {
    email_id?: string;
    to?: string | string[];
  };
};

@Injectable()
export class ResendWebhookService {
  constructor(private readonly audit: AuditService) {}

  async handle(input: {
    rawBody: Buffer;
    headers: Record<string, string | string[] | undefined>;
    body: ResendWebhookPayload;
    requestId: string;
  }): Promise<{ ok: true }> {
    this.verifySignature(input.rawBody, input.headers);

    const eventType = typeof input.body.type === "string" ? input.body.type : "unknown";
    const emailId = typeof input.body.data?.email_id === "string" ? input.body.data.email_id : undefined;
    const recipient = this.firstRecipient(input.body.data?.to);

    await this.audit.record({
      action: `email.${eventType}`,
      resourceType: "email",
      resourceId: emailId ?? null,
      requestId: input.requestId,
      metadata: {
        provider: "resend",
        ...(recipient ? { recipientHash: sha256Short(recipient) } : {}),
      },
    });

    process.stdout.write(
      `${JSON.stringify({
        level: "info",
        event: "email_webhook",
        provider: "resend",
        requestId: input.requestId,
        type: eventType,
        emailId,
        recipientHash: recipient ? sha256Short(recipient) : undefined,
      })}\n`,
    );

    return { ok: true };
  }

  private verifySignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): void {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return;

    const id = this.header(headers, "svix-id");
    const timestamp = this.header(headers, "svix-timestamp");
    const signature = this.header(headers, "svix-signature");
    if (!id || !timestamp || !signature) {
      throw new UnauthorizedException("邮件回调签名缺失");
    }

    const payload = `${id}.${timestamp}.${rawBody.toString("utf8")}`;
    const expected = createHmac("sha256", this.normalizeSecret(secret)).update(payload).digest("base64");
    const candidates = signature
      .split(" ")
      .map((part) => part.replace(/^v\d+,/, "").trim())
      .filter(Boolean);

    const ok = candidates.some((candidate) => this.safeEqual(candidate, expected));
    if (!ok) throw new UnauthorizedException("邮件回调签名无效");
  }

  private normalizeSecret(secret: string): Buffer | string {
    return secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : secret;
  }

  private safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }

  private firstRecipient(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) return value[0];
    return value;
  }
}
