import { BadRequestException, Injectable, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { AccessStatus, HouseholdUserStatus, MemberAccessRole, MemberSubjectType, UserStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { createOpaqueToken, normalizePhone, safeEqual, sha256 } from "./token-utils.js";

const smsPurpose = "LOGIN";
const emailPurpose = "EMAIL_LOGIN";
const smsTtlMs = 5 * 60 * 1000;
const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;
const smsSendWindowMs = 60 * 1000;
const smsMaxSendsPerWindow = 3;
const smsMaxAttempts = 5;

type HouseholdBootstrapStore = Pick<
  PrismaService,
  "householdUser" | "household" | "memberProfile" | "memberAccess"
>;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async sendEmailCode(email: string): Promise<{ expiresAt: Date; mockCode?: string }> {
    const normalizedEmail = this.normalizeEmail(email);
    const code = this.createSmsCode();
    const expiresAt = new Date(Date.now() + smsTtlMs);
    const emailHash = sha256(normalizedEmail);
    const recentSendCount = await this.prisma.smsVerificationCode.count({
      where: {
        phoneHash: emailHash,
        purpose: emailPurpose,
        createdAt: { gt: new Date(Date.now() - smsSendWindowMs) },
      },
    });

    if (recentSendCount >= smsMaxSendsPerWindow) {
      throw new BadRequestException("验证码发送过于频繁，请稍后再试");
    }

    await this.deliverEmailCode(normalizedEmail, code);

    await this.prisma.smsVerificationCode.create({
      data: {
        phoneHash: emailHash,
        purpose: emailPurpose,
        codeHash: sha256(`${emailHash}:${code}`),
        expiresAt,
      },
    });

    return this.canExposeEmailMockCode() ? { expiresAt, mockCode: code } : { expiresAt };
  }

  async verifyEmailCode(
    email: string,
    code: string,
    deviceId?: string,
  ): Promise<{ accessToken: string; expiresAt: Date; user: { id: string } }> {
    const normalizedEmail = this.normalizeEmail(email);
    const emailHash = sha256(normalizedEmail);
    const challenge = await this.prisma.smsVerificationCode.findFirst({
      where: {
        phoneHash: emailHash,
        purpose: emailPurpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!challenge) throw new BadRequestException("验证码无效或已过期");
    if (challenge.attempts >= smsMaxAttempts) {
      throw new BadRequestException("验证码无效或已过期");
    }

    const expectedHash = sha256(`${emailHash}:${code}`);
    if (!safeEqual(challenge.codeHash, expectedHash)) {
      await this.prisma.smsVerificationCode.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("验证码无效或已过期");
    }

    const now = new Date();
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.smsVerificationCode.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });

      const existingIdentity = await tx.authIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: "email_code",
            providerSubject: emailHash,
          },
        },
        include: { user: true },
      });

      const currentUser =
        existingIdentity?.user ??
        (await tx.user.create({
          data: {
            authIdentities: {
              create: {
                provider: "email_code",
                providerSubject: emailHash,
                verifiedAt: now,
              },
            },
          },
        }));

      if (currentUser.status === UserStatus.DELETION_PENDING) {
        await tx.user.update({ where: { id: currentUser.id }, data: { status: UserStatus.ACTIVE } });
      }

      await this.ensureDefaultHousehold(tx, currentUser.id);
      return currentUser;
    });

    const accessToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + sessionTtlMs);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(accessToken),
        deviceId: deviceId ?? null,
        expiresAt,
      },
    });

    return { accessToken, expiresAt, user: { id: user.id } };
  }

  async sendSms(phone: string): Promise<{ expiresAt: Date; mockCode?: string }> {
    const code = this.createSmsCode();
    const expiresAt = new Date(Date.now() + smsTtlMs);
    const phoneHash = this.phoneHash(phone);
    const recentSendCount = await this.prisma.smsVerificationCode.count({
      where: {
        phoneHash,
        purpose: smsPurpose,
        createdAt: { gt: new Date(Date.now() - smsSendWindowMs) },
      },
    });

    if (recentSendCount >= smsMaxSendsPerWindow) {
      throw new BadRequestException("验证码发送过于频繁，请稍后再试");
    }

    await this.deliverSmsCode(phone, code);

    await this.prisma.smsVerificationCode.create({
      data: {
        phoneHash,
        purpose: smsPurpose,
        codeHash: sha256(`${phoneHash}:${code}`),
        expiresAt,
      },
    });

    return this.canExposeMockCode() ? { expiresAt, mockCode: code } : { expiresAt };
  }

  async verifySms(
    phone: string,
    code: string,
    deviceId?: string,
  ): Promise<{ accessToken: string; expiresAt: Date; user: { id: string } }> {
    const phoneHash = this.phoneHash(phone);
    const challenge = await this.prisma.smsVerificationCode.findFirst({
      where: {
        phoneHash,
        purpose: smsPurpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!challenge) throw new BadRequestException("验证码无效或已过期");
    if (challenge.attempts >= smsMaxAttempts) {
      throw new BadRequestException("验证码无效或已过期");
    }

    const expectedHash = sha256(`${phoneHash}:${code}`);
    if (!safeEqual(challenge.codeHash, expectedHash)) {
      await this.prisma.smsVerificationCode.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("验证码无效或已过期");
    }

    const now = new Date();
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.smsVerificationCode.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });

      const existingIdentity = await tx.authIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: "phone_sms",
            providerSubject: phoneHash,
          },
        },
        include: { user: true },
      });

      const currentUser =
        existingIdentity?.user ??
        (await tx.user.create({
          data: {
            authIdentities: {
              create: {
                provider: "phone_sms",
                providerSubject: phoneHash,
                verifiedAt: now,
              },
            },
          },
        }));

      if (currentUser.status === UserStatus.DELETION_PENDING) {
        await tx.user.update({ where: { id: currentUser.id }, data: { status: UserStatus.ACTIVE } });
      }

      await this.ensureDefaultHousehold(tx, currentUser.id);
      return currentUser;
    });

    const accessToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + sessionTtlMs);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(accessToken),
        deviceId: deviceId ?? null,
        expiresAt,
      },
    });

    return { accessToken, expiresAt, user: { id: user.id } };
  }

  async validateSession(accessToken: string): Promise<{ id: string; sessionId: string }> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(accessToken) },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException("登录已失效");
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    return { id: session.user.id, sessionId: session.id };
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  phoneHash(phone: string): string {
    return sha256(normalizePhone(phone));
  }

  private createSmsCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private canExposeMockCode(): boolean {
    return process.env.NODE_ENV !== "production" && process.env.SMS_PROVIDER !== "webhook";
  }

  private canExposeEmailMockCode(): boolean {
    return process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async deliverEmailCode(email: string, code: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      if (process.env.NODE_ENV === "production") throw new InternalServerErrorException("邮件服务未配置");
      return;
    }

    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const from = process.env.RESEND_FROM_EMAIL ?? "医记 <onboarding@resend.dev>";
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: "医记登录验证码",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#1b2925"><h2>医记登录验证码</h2><p>你的验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>验证码 5 分钟内有效。若非本人操作，请忽略这封邮件。</p></div>`,
      text: `医记登录验证码：${code}。验证码 5 分钟内有效。若非本人操作，请忽略这封邮件。`,
    });

    if (error) throw new InternalServerErrorException("验证码发送失败，请稍后再试");
  }

  private async deliverSmsCode(phone: string, code: string): Promise<void> {
    const provider = process.env.SMS_PROVIDER ?? (process.env.NODE_ENV === "production" ? "" : "mock");
    if (provider === "mock") return;

    if (provider === "webhook") {
      const url = process.env.SMS_WEBHOOK_URL;
      if (!url) throw new InternalServerErrorException("短信服务未配置");

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.SMS_WEBHOOK_API_KEY ? { Authorization: `Bearer ${process.env.SMS_WEBHOOK_API_KEY}` } : {}),
        },
        body: JSON.stringify({
          phone: normalizePhone(phone),
          code,
          purpose: smsPurpose,
          expiresInSeconds: Math.floor(smsTtlMs / 1000),
        }),
      });

      if (!response.ok) throw new InternalServerErrorException("验证码发送失败，请稍后再试");
      return;
    }

    if (provider === "aliyun") {
      await this.deliverSmsCodeWithAliyun(phone, code);
      return;
    }

    throw new InternalServerErrorException("短信服务未配置");
  }

  private async deliverSmsCodeWithAliyun(phone: string, code: string): Promise<void> {
    const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
    const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
    const signName = process.env.ALIYUN_SMS_SIGN_NAME;
    const templateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE;
    if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
      throw new InternalServerErrorException("短信服务未配置");
    }

    const [clientModule, { SendSmsRequest }] = await Promise.all([
      import("@alicloud/dysmsapi20170525"),
      import("@alicloud/dysmsapi20170525/dist/models/model.js"),
    ]);
    const Client = (clientModule.default ?? clientModule) as unknown as new (config: {
      accessKeyId: string;
      accessKeySecret: string;
      endpoint: string;
    }) => { sendSms: (request: InstanceType<typeof SendSmsRequest>) => Promise<{ body?: { code?: string } }> };
    const client = new Client({
      accessKeyId,
      accessKeySecret,
      endpoint: process.env.ALIYUN_SMS_ENDPOINT ?? "dysmsapi.aliyuncs.com",
    });
    const response = await client.sendSms(
      new SendSmsRequest({
        phoneNumbers: normalizePhone(phone),
        signName,
        templateCode,
        templateParam: JSON.stringify({ code }),
      }),
    );

    if (response.body?.code !== "OK") {
      throw new InternalServerErrorException("验证码发送失败，请稍后再试");
    }
  }

  private async ensureDefaultHousehold(tx: HouseholdBootstrapStore, userId: string): Promise<void> {
    const existing = await tx.householdUser.findFirst({
      where: { userId, status: HouseholdUserStatus.ACTIVE },
      select: { householdId: true },
    });
    if (existing) return;

    const household = await tx.household.create({
      data: { ownerUserId: userId },
    });

    await tx.householdUser.create({
      data: {
        householdId: household.id,
        userId,
        status: HouseholdUserStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });

    const member = await tx.memberProfile.create({
      data: {
        householdId: household.id,
        subjectUserId: userId,
        subjectType: MemberSubjectType.SELF,
        displayName: "我",
      },
    });

    await tx.memberAccess.create({
      data: {
        memberId: member.id,
        userId,
        role: MemberAccessRole.SELF,
        status: AccessStatus.ACTIVE,
        grantedById: userId,
      },
    });
  }
}
