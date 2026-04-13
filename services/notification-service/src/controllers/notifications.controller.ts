import { Controller, Get, Inject, Param, Patch, UseGuards } from "@nestjs/common";
import { CurrentUser, ServiceAuthGuard } from "@qoms/backend-common";
import type { RequestUserContext } from "@qoms/shared";
import { NotificationService } from "../services/notification.service";

@Controller("notifications")
@UseGuards(ServiceAuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationService) private readonly notificationService: NotificationService) {}

  @Get("me")
  myNotifications(@CurrentUser() user: RequestUserContext | null) {
    return this.notificationService.listMyNotifications(user);
  }

  @Patch(":id/read")
  markRead(@Param("id") id: string, @CurrentUser() user: RequestUserContext | null) {
    return this.notificationService.markAsRead(id, user);
  }
}
