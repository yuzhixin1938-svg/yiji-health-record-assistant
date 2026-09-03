import { IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { AccessStatus, MemberAccessRole, MemberSubjectType } from "../generated/prisma/enums.js";

export class CreateMemberDto {
  @IsEnum(MemberSubjectType)
  subjectType!: MemberSubjectType;

  @IsString()
  @MaxLength(40)
  displayName!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dateOfBirth?: string;
}

export class CreateInvitationDto {
  @IsOptional()
  @Matches(/^(\+?86)?1[3-9]\d{9}$/)
  inviteePhone?: string;

  @IsEnum(MemberAccessRole)
  role!: MemberAccessRole;
}

export class UpdateAccessDto {
  @IsOptional()
  @IsEnum(MemberAccessRole)
  role?: MemberAccessRole;

  @IsOptional()
  @IsEnum(AccessStatus)
  status?: AccessStatus;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
