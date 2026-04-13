import { Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { HEADER_REQUEST_ID } from "@qoms/shared";
import type { Request } from "express";
import { GatewayCurrentUser } from "../security/gateway-current-user.decorator";
import { GatewayAuthGuard } from "../security/gateway-auth.guard";
import { RatePolicy } from "../security/gateway-auth.decorators";
import { GatewayProxyService } from "../services/gateway-proxy.service";
import { RateLimitGuard } from "../services/rate-limit.guard";

@Controller("queues")
@UseGuards(GatewayAuthGuard, RateLimitGuard)
export class QueueProxyController {
  constructor(@Inject(GatewayProxyService) private readonly proxy: GatewayProxyService) {}

  @Post(":zoneId/join")
  @RatePolicy("join_queue")
  join(@Req() req: Request, @Param("zoneId") zoneId: string, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "queue",
      method: "POST",
      path: `/queues/${zoneId}/join`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }

  @Post(":zoneId/leave")
  @RatePolicy("join_queue")
  leave(@Req() req: Request, @Param("zoneId") zoneId: string, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "queue",
      method: "POST",
      path: `/queues/${zoneId}/leave`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }

  @Get(":zoneId/me")
  me(@Req() req: Request, @Param("zoneId") zoneId: string, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "queue",
      method: "GET",
      path: `/queues/${zoneId}/me`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }

  @Get(":zoneId/state")
  state(@Req() req: Request, @Param("zoneId") zoneId: string, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "queue",
      method: "GET",
      path: `/queues/${zoneId}/state`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }
}
