import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateVisitPackDto {
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(200)
  visitReason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  recentSymptoms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  questions?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  selectedRecordIds!: string[];

  @IsOptional()
  @IsBoolean()
  includeOriginalFiles?: boolean;

  @IsOptional()
  @IsIn(["none", "embed_pdf"])
  attachmentMode?: "none" | "embed_pdf";
}

export class CreateVisitPackShareDto {
  @IsISO8601({ strict: true })
  expiresAt!: string;
}
