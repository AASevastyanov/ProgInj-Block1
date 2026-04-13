import { IsIn, IsOptional, IsString } from "class-validator";
import { ROLES } from "@qoms/shared";

export class UpdateUserRoleDto {
  @IsString()
  @IsIn(ROLES)
  role!: (typeof ROLES)[number];
}

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  role?: string;
}

