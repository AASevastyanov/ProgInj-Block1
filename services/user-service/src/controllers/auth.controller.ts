import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, ServiceAuthGuard } from "@qoms/backend-common";
import type { RequestUserContext } from "@qoms/shared";
import { LoginDto, RegisterDto } from "../dto/auth.dto";
import { UserService } from "../services/user.service";

@Controller("auth")
export class AuthController {
  constructor(@Inject(UserService) private readonly userService: UserService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.userService.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.userService.login(dto);
  }

  @Get("me")
  @UseGuards(ServiceAuthGuard)
  async me(@CurrentUser() user: RequestUserContext | null) {
    if (!user) {
      return null;
    }
    return this.userService.getUserById(user.userId);
  }
}
