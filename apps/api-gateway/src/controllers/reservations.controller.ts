import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { HEADER_REQUEST_ID } from "@qoms/shared";
import type { Request } from "express";
import { GatewayCurrentUser } from "../security/gateway-current-user.decorator";
import { GatewayAuthGuard } from "../security/gateway-auth.guard";
import { RatePolicy } from "../security/gateway-auth.decorators";
import { GatewayProxyService } from "../services/gateway-proxy.service";
import { RateLimitGuard } from "../services/rate-limit.guard";

@Controller("reservations")
@UseGuards(GatewayAuthGuard, RateLimitGuard)
export class ReservationsProxyController {
  constructor(@Inject(GatewayProxyService) private readonly proxy: GatewayProxyService) {}

  @Post()
  @RatePolicy("create_reservation")
  create(@Req() req: Request, @Body() body: unknown, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "reservation",
      method: "POST",
      path: "/reservations",
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user,
      body
    });
  }

  @Delete(":id")
  @RatePolicy("create_reservation")
  cancel(@Req() req: Request, @Param("id") id: string, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "reservation",
      method: "DELETE",
      path: `/reservations/${id}`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }

  @Get("me")
  my(@Req() req: Request, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "reservation",
      method: "GET",
      path: "/reservations/me",
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }

  @Get("zone/:zoneId")
  byZone(
    @Req() req: Request,
    @Param("zoneId") zoneId: string,
    @GatewayCurrentUser() user: Record<string, unknown> | null,
    @Query() query: Record<string, unknown>
  ) {
    return this.proxy.forward({
      service: "reservation",
      method: "GET",
      path: `/reservations/zone/${zoneId}`,
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user,
      query
    });
  }
}
