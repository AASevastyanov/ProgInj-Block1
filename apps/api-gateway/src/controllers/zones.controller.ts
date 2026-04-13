import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { HEADER_REQUEST_ID } from "@qoms/shared";
import type { Request } from "express";
import { GatewayCurrentUser } from "../security/gateway-current-user.decorator";
import { GatewayAuthGuard } from "../security/gateway-auth.guard";
import { GatewayRoles, RatePolicy } from "../security/gateway-auth.decorators";
import { GatewayProxyService } from "../services/gateway-proxy.service";
import { RateLimitGuard } from "../services/rate-limit.guard";

@Controller("zones")
@UseGuards(GatewayAuthGuard, RateLimitGuard)
export class ZonesProxyController {
  constructor(@Inject(GatewayProxyService) private readonly proxy: GatewayProxyService) {}

  @Get()
  list(@Req() req: Request, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "zone",
      method: "GET",
      path: "/zones",
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }

  @Get(":id")
  getZone(@Req() req: Request, @Param("id") id: string, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "zone",
      method: "GET",
      path: `/zones/${id}`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }

  @Post()
  @GatewayRoles("dining_admin", "coworking_admin", "system_admin")
  @RatePolicy("admin_write")
  createZone(@Req() req: Request, @Body() body: unknown, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "zone",
      method: "POST",
      path: "/zones",
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user,
      body
    });
  }

  @Patch(":id")
  @GatewayRoles("dining_admin", "coworking_admin", "system_admin")
  @RatePolicy("admin_write")
  updateZone(@Req() req: Request, @Param("id") id: string, @Body() body: unknown, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "zone",
      method: "PATCH",
      path: `/zones/${id}`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user,
      body
    });
  }

  @Get(":id/status")
  getZoneStatus(@Req() req: Request, @Param("id") id: string, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "zone",
      method: "GET",
      path: `/zones/${id}/status`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }

  @Get(":id/rules")
  getZoneRules(@Req() req: Request, @Param("id") id: string, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "zone",
      method: "GET",
      path: `/zones/${id}/rules`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }

  @Patch(":id/rules")
  @GatewayRoles("dining_admin", "coworking_admin", "system_admin")
  @RatePolicy("admin_write")
  updateZoneRules(@Req() req: Request, @Param("id") id: string, @Body() body: unknown, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "zone",
      method: "PATCH",
      path: `/zones/${id}/rules`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user,
      body
    });
  }
}
