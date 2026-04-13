import { Body, Controller, Get, Inject, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { HEADER_REQUEST_ID } from "@qoms/shared";
import type { Request } from "express";
import { GatewayCurrentUser } from "../security/gateway-current-user.decorator";
import { GatewayAuthGuard } from "../security/gateway-auth.guard";
import { GatewayRoles, RatePolicy } from "../security/gateway-auth.decorators";
import { GatewayProxyService } from "../services/gateway-proxy.service";
import { RateLimitGuard } from "../services/rate-limit.guard";

@Controller("users")
@UseGuards(GatewayAuthGuard, RateLimitGuard)
export class UsersProxyController {
  constructor(@Inject(GatewayProxyService) private readonly proxy: GatewayProxyService) {}

  @Get()
  @GatewayRoles("dining_admin", "coworking_admin", "system_admin")
  list(@Req() req: Request, @GatewayCurrentUser() user: Record<string, unknown> | null, @Query() query: Record<string, unknown>) {
    return this.proxy.forward({
      service: "user",
      method: "GET",
      path: "/users",
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user,
      query
    });
  }

  @Get(":id")
  listById(@Req() req: Request, @Param("id") id: string, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "user",
      method: "GET",
      path: `/users/${id}`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }

  @Patch(":id/role")
  @GatewayRoles("system_admin")
  @RatePolicy("admin_write")
  patchRole(@Req() req: Request, @Param("id") id: string, @Body() body: unknown, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "user",
      method: "PATCH",
      path: `/users/${id}/role`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user,
      body
    });
  }
}
