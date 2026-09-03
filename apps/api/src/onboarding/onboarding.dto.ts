import { ArrayMaxSize, IsArray, IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class UpsertMyProfileDto {
  @IsString()
  @MaxLength(40)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dateOfBirth?: string;

  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  healthConcerns!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergyNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  chronicDiseaseNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  medicationStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  followUpPlanStatus?: string;
}
