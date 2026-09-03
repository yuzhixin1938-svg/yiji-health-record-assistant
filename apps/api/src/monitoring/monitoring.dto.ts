import { IsOptional, IsString, MaxLength } from "class-validator";

export class ClientErrorDto {
  @IsString()
  @MaxLength(80)
  type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  page?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  userAction?: string;
}
