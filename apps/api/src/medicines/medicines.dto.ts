import { IsArray, IsBoolean, IsISO8601, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class MedicationScheduleDto {
  @IsString()
  @MaxLength(20)
  timeLabel!: string;

  @IsString()
  @MaxLength(40)
  doseText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  reminderAt?: string;
}

export class CreateMedicineDto {
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  specification?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  purposeNote?: string;

  @IsString()
  @MaxLength(200)
  dosageInstruction!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  startDate?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endDate?: string;

  @IsOptional()
  @IsNumber()
  currentQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  quantityUnit?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  expiresOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  storageLocation?: string;

  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationScheduleDto)
  schedules?: MedicationScheduleDto[];
}

export class UpdateMedicineDto extends CreateMedicineDto {}
