import { IsOptional, IsString } from "class-validator";

export class RefreshAgentTodosDto {
  @IsOptional()
  @IsString()
  memberId?: string;
}
