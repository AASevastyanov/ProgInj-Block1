import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ServiceAuthGuard } from "@qoms/backend-common";
import { CreateOccupancyEventDto } from "../dto/occupancy-event.dto";
import { MonitoringService } from "../services/monitoring.service";

@Controller()
@UseGuards(ServiceAuthGuard)
export class MonitoringController {
  constructor(@Inject(MonitoringService) private readonly monitoringService: MonitoringService) {}

  @Post("occupancy-events")
  ingest(@Body() dto: CreateOccupancyEventDto) {
    return this.monitoringService.ingestEvent(dto);
  }

  @Get("occupancy-events/:zoneId/history")
  history(@Param("zoneId") zoneId: string) {
    return this.monitoringService.getHistory(zoneId);
  }

  @Get("telemetry/:zoneId/latest")
  latest(@Param("zoneId") zoneId: string) {
    return this.monitoringService.getLatest(zoneId);
  }
}
