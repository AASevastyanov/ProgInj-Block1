import { Body, Controller, ForbiddenException, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, Roles, RolesGuard, ServiceAuthGuard } from "@qoms/backend-common";
import type { RequestUserContext } from "@qoms/shared";
import { CreateZoneDto, UpdateZoneDto, UpdateZoneRulesDto } from "../dto/zone.dto";
import { ZoneService } from "../services/zone.service";

@Controller("zones")
@UseGuards(ServiceAuthGuard)
export class ZonesController {
  constructor(@Inject(ZoneService) private readonly zoneService: ZoneService) {}

  @Get()
  listZones() {
    return this.zoneService.listZones();
  }

  @Get(":id")
  getZone(@Param("id") id: string) {
    return this.zoneService.getZone(id);
  }

  @Post()
  @Roles("dining_admin", "coworking_admin", "system_admin")
  @UseGuards(RolesGuard)
  async createZone(@Body() dto: CreateZoneDto, @CurrentUser() user: RequestUserContext | null) {
    this.assertAdminCanManageZone(user, dto.type);
    return this.zoneService.createZone(dto, user?.userId ?? "system");
  }

  @Patch(":id")
  @Roles("dining_admin", "coworking_admin", "system_admin")
  @UseGuards(RolesGuard)
  async updateZone(@Param("id") id: string, @Body() dto: UpdateZoneDto, @CurrentUser() user: RequestUserContext | null) {
    const zone = await this.zoneService.getZone(id);
    this.assertAdminCanManageZone(user, zone.type);
    return this.zoneService.updateZone(id, dto, user?.userId ?? "system");
  }

  @Get(":id/status")
  getZoneStatus(@Param("id") id: string) {
    return this.zoneService.getZoneStatus(id);
  }

  @Get(":id/rules")
  getZoneRules(@Param("id") id: string) {
    return this.zoneService.getZoneRules(id);
  }

  @Patch(":id/rules")
  @Roles("dining_admin", "coworking_admin", "system_admin")
  @UseGuards(RolesGuard)
  async updateZoneRules(
    @Param("id") id: string,
    @Body() dto: UpdateZoneRulesDto,
    @CurrentUser() user: RequestUserContext | null
  ) {
    const zone = await this.zoneService.getZone(id);
    this.assertAdminCanManageZone(user, zone.type);
    return this.zoneService.updateZoneRules(id, dto, user?.userId ?? "system");
  }

  private assertAdminCanManageZone(user: RequestUserContext | null, zoneType: string): void {
    if (!user) {
      return;
    }
    if (user.role === "system_admin") {
      return;
    }
    if (user.role === "dining_admin" && zoneType === "dining_zone") {
      return;
    }
    if (user.role === "coworking_admin" && zoneType === "coworking_zone") {
      return;
    }
    throw new ForbiddenException("Admin role does not match zone type");
  }
}
