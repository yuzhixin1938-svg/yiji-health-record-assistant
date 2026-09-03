import { IsOptional, IsString, Length, Matches } from "class-validator";

export class SendSmsDto {
  @Matches(/^(\+?86)?1[3-9]\d{9}$/)
  phone!: string;
}

export class VerifySmsDto {
  @Matches(/^(\+?86)?1[3-9]\d{9}$/)
  phone!: string;

  @IsString()
  @Length(4, 8)
  code!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class SendEmailCodeDto {
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  email!: string;
}

export class VerifyEmailCodeDto {
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  email!: string;

  @IsString()
  @Length(4, 8)
  code!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}
