export const memberActions = [
  "member.read",
  "record.read",
  "record.original.read",
  "record.create",
  "record.update",
  "record.delete",
  "medicine.manage",
  "reminder.manage",
  "summary.manage",
  "member.export",
  "share.create",
  "member.delete",
  "access.manage",
] as const;

export type MemberAction = (typeof memberActions)[number];

export type MemberAccessRole =
  | "SELF"
  | "GUARDIAN"
  | "MANAGER"
  | "CONTRIBUTOR"
  | "VIEWER"
  | "SUPPORT";

export type MemberGrant = {
  memberId: string;
  userId: string;
  role: MemberAccessRole;
  status: "ACTIVE" | "REVOKED";
  expiresAt: Date | null;
};

export type PermissionContext = {
  actorUserId: string;
  resourceMemberId: string;
  action: MemberAction;
  grant: MemberGrant | null;
  now?: Date;
  viewerCanReadOriginal?: boolean;
  supportTicketActive?: boolean;
};

const fullAccess = new Set<MemberAction>(memberActions);

const contributorAccess = new Set<MemberAction>([
  "member.read",
  "record.read",
  "record.original.read",
  "record.create",
  "record.update",
  "medicine.manage",
  "reminder.manage",
  "summary.manage",
]);

const viewerAccess = new Set<MemberAction>(["member.read", "record.read"]);

export function canAccessMember(context: PermissionContext): boolean {
  const { grant } = context;
  if (!grant) return false;
  if (grant.userId !== context.actorUserId) return false;
  if (grant.memberId !== context.resourceMemberId) return false;
  if (grant.status !== "ACTIVE") return false;

  const now = context.now ?? new Date();
  if (grant.expiresAt && grant.expiresAt <= now) return false;

  if (grant.role === "SUPPORT") {
    return context.supportTicketActive === true && context.action === "record.read";
  }

  if (grant.role === "VIEWER" && context.action === "record.original.read") {
    return context.viewerCanReadOriginal === true;
  }

  if (grant.role === "SELF" || grant.role === "GUARDIAN" || grant.role === "MANAGER") {
    return fullAccess.has(context.action);
  }

  if (grant.role === "CONTRIBUTOR") return contributorAccess.has(context.action);
  return viewerAccess.has(context.action);
}
