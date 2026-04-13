import { Controller, Get, Inject, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { HEADER_REQUEST_ID } from "@qoms/shared";
import type { Request } from "express";
import { GatewayCurrentUser } from "../security/gateway-current-user.decorator";
import { GatewayAuthGuard } from "../security/gateway-auth.guard";
import { GatewayProxyService } from "../services/gateway-proxy.service";
import { RateLimitGuard } from "../services/rate-limit.guard";

@Controller("notifications")
@UseGuards(GatewayAuthGuard, RateLimitGuard)
export class NotificationsProxyController {
  constructor(@Inject(GatewayProxyService) private readonly proxy: GatewayProxyService) {}

  @Get("me")
  my(@Req() req: Request, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "notification",
      method: "GET",
      path: "/notifications/me",
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }

  @Patch(":id/read")
  markRead(@Req() req: Request, @Param("id") id: string, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "notification",
      method: "PATCH",
      path: `/notifications/${id}/read`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }
}
