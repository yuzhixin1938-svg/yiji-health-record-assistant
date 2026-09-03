import { IsISO8601, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateTodoDto {
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsString()
  @MaxLength(40)
  type!: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sourceType?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateTodoDto extends CreateTodoDto {}
