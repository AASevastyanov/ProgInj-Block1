import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { HEADER_REQUEST_ID } from "@qoms/shared";
import type { Request } from "express";
import { GatewayCurrentUser } from "../security/gateway-current-user.decorator";
import { GatewayAuthGuard } from "../security/gateway-auth.guard";
import { GatewayRoles, RatePolicy } from "../security/gateway-auth.decorators";
import { GatewayProxyService } from "../services/gateway-proxy.service";
import { RateLimitGuard } from "../services/rate-limit.guard";

@Controller()
@UseGuards(GatewayAuthGuard, RateLimitGuard)
export class MonitoringProxyController {
  constructor(@Inject(GatewayProxyService) private readonly proxy: GatewayProxyService) {}

  @Post("occupancy-events")
  @GatewayRoles("dining_admin", "coworking_admin", "system_admin")
  @RatePolicy("occupancy_ingest")
  ingest(@Req() req: Request, @Body() body: unknown, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "monitoring",
      method: "POST",
      path: "/occupancy-events",
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user,
      body
    });
  }

  @Get("occupancy-events/:zoneId/history")
  @GatewayRoles("dining_admin", "coworking_admin", "system_admin")
  history(@Req() req: Request, @Param("zoneId") zoneId: string, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "monitoring",
      method: "GET",
      path: `/occupancy-events/${zoneId}/history`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }

  @Get("telemetry/:zoneId/latest")
  @GatewayRoles("dining_admin", "coworking_admin", "system_admin")
  latest(@Req() req: Request, @Param("zoneId") zoneId: string, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "monitoring",
      method: "GET",
      path: `/telemetry/${zoneId}/latest`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }
}
