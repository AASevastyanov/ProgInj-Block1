import { Body, Controller, ForbiddenException, Get, Inject, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, Roles, RolesGuard, ServiceAuthGuard } from "@qoms/backend-common";
import type { RequestUserContext } from "@qoms/shared";
import { ListUsersQueryDto, UpdateUserRoleDto } from "../dto/user.dto";
import { UserService } from "../services/user.service";

@Controller("users")
@UseGuards(ServiceAuthGuard)
export class UsersController {
  constructor(@Inject(UserService) private readonly userService: UserService) {}

  @Get()
  list(@Query() query: ListUsersQueryDto, @CurrentUser() user: RequestUserContext | null) {
    if (user && !["dining_admin", "coworking_admin", "system_admin"].includes(user.role)) {
      throw new ForbiddenException("Access denied");
    }
    return this.userService.listUsers(query.role);
  }

  @Get(":id")
  async getById(@Param("id") id: string, @CurrentUser() user: RequestUserContext | null) {
    if (user && user.userId !== id && !["dining_admin", "coworking_admin", "system_admin"].includes(user.role)) {
      throw new ForbiddenException("Access denied");
    }
    return this.userService.getUserById(id);
  }

  @Patch(":id/role")
  @Roles("system_admin")
  @UseGuards(RolesGuard)
  updateRole(@Param("id") id: string, @Body() dto: UpdateUserRoleDto) {
    return this.userService.updateRole(id, dto.role);
  }
}
