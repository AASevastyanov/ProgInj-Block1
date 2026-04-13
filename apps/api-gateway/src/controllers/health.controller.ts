import { Controller, Get } from "@nestjs/common";
import { PUBLIC_ROUTE } from "../security/gateway-auth.decorators";

@Controller("health")
export class GatewayHealthController {
  @Get()
  @PUBLIC_ROUTE()
  getHealth() {
    return {
      status: "ok",
      service: "api-gateway",
      timestamp: new Date().toISOString()
    };
  }
}
