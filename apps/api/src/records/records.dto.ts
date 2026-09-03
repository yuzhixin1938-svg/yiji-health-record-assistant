import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class UploadRecordDto {
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  recordType?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  visitDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  institution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  healthConcern?: string;

  @IsOptional()
  @IsIn(["standard", "deep"])
  recognitionMode?: "standard" | "deep";
}

export class CreateManualRecordDto {
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(40)
  recordType!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  visitDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  institution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  healthConcern?: string;
}

export class ReviewRecordDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(40)
  recordType!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  visitDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  institution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  healthConcern?: string;
}
