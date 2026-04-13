import { Controller, Get } from "@nestjs/common";
import { createHealthResponse } from "@qoms/backend-common";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return createHealthResponse("user-service");
  }
}

