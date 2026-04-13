import { Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, ServiceAuthGuard } from "@qoms/backend-common";
import type { RequestUserContext } from "@qoms/shared";
import { QueueService } from "../services/queue.service";

@Controller("queues")
@UseGuards(ServiceAuthGuard)
export class QueueController {
  constructor(@Inject(QueueService) private readonly queueService: QueueService) {}

  @Post(":zoneId/join")
  join(@Param("zoneId") zoneId: string, @CurrentUser() user: RequestUserContext | null) {
    return this.queueService.joinQueue(zoneId, user);
  }

  @Post(":zoneId/leave")
  leave(@Param("zoneId") zoneId: string, @CurrentUser() user: RequestUserContext | null) {
    return this.queueService.leaveQueue(zoneId, user);
  }

  @Get(":zoneId/me")
  me(@Param("zoneId") zoneId: string, @CurrentUser() user: RequestUserContext | null) {
    return this.queueService.getMyQueueState(zoneId, user);
  }

  @Get(":zoneId/state")
  state(@Param("zoneId") zoneId: string) {
    return this.queueService.getQueueState(zoneId);
  }
}
