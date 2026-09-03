import { IsISO8601, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateMetricDto {
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsString()
  @MaxLength(40)
  metricType!: string;

  @IsObject()
  value!: Record<string, unknown>;

  @IsString()
  @MaxLength(20)
  unit!: string;

  @IsISO8601()
  measuredAt!: string;

  @IsString()
  @MaxLength(40)
  sourceType!: string;

  @IsOptional()
  @IsString()
  sourceRecordId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
