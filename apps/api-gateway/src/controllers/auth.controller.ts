import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { HEADER_REQUEST_ID } from "@qoms/shared";
import type { Request } from "express";
import { GatewayCurrentUser } from "../security/gateway-current-user.decorator";
import { GatewayAuthGuard } from "../security/gateway-auth.guard";
import { PUBLIC_ROUTE, RatePolicy } from "../security/gateway-auth.decorators";
import { GatewayProxyService } from "../services/gateway-proxy.service";
import { RateLimitGuard } from "../services/rate-limit.guard";

@Controller("auth")
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(@Inject(GatewayProxyService) private readonly proxy: GatewayProxyService) {}

  @Post("register")
  @PUBLIC_ROUTE()
  @RatePolicy("default_write")
  register(@Req() req: Request, @Body() body: unknown) {
    return this.proxy.forward({
      service: "user",
      method: "POST",
      path: "/auth/register",
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      body
    });
  }

  @Post("login")
  @PUBLIC_ROUTE()
  @RatePolicy("login")
  login(@Req() req: Request, @Body() body: unknown) {
    return this.proxy.forward({
      service: "user",
      method: "POST",
      path: "/auth/login",
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      body
    });
  }

  @Get("me")
  @UseGuards(GatewayAuthGuard)
  me(@Req() req: Request, @GatewayCurrentUser() user: Record<string, unknown> | null) {
    return this.proxy.forward({
      service: "user",
      method: "GET",
      path: "/auth/me",
      requestId: String(req.headers[HEADER_REQUEST_ID] ?? ""),
      user
    });
  }
}
