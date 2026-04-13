import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { EventEnvelope, RequestUserContext } from "@qoms/shared";
import { HEADER_SERVICE_TOKEN } from "@qoms/shared";
import axios from "axios";
import { DataSource, Repository } from "typeorm";
import { NotificationEntity } from "../entities/notification.entity";
import { ProcessedEventEntity } from "../entities/processed-event.entity";

type RemoteUser = {
  id: string;
  role: string;
  email: string;
  fullName: string;
};

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepository: Repository<NotificationEntity>,
    @InjectRepository(ProcessedEventEntity)
    private readonly processedRepository: Repository<ProcessedEventEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource
  ) {}

  async listMyNotifications(user: RequestUserContext | null): Promise<Record<string, unknown>[]> {
    if (!user) {
      throw new BadRequestException("Missing user context");
    }
    const items = await this.notificationRepository.find({
      where: { userId: user.userId },
      order: { createdAt: "DESC" }
    });
    return items;
  }

  async markAsRead(id: string, user: RequestUserContext | null): Promise<Record<string, unknown>> {
    if (!user) {
      throw new BadRequestException("Missing user context");
    }
    const item = await this.notificationRepository.findOne({ where: { id, userId: user.userId } });
    if (!item) {
      throw new NotFoundException("Notification not found");
    }
    item.readAt = new Date();
    const saved = await this.notificationRepository.save(item);
    return saved;
  }

  async handleEvent(event: EventEnvelope<Record<string, any>>): Promise<void> {
    const existing = await this.processedRepository.findOne({ where: { eventId: event.eventId } });
    if (existing) {
      return;
    }

    const notifications = await this.buildNotifications(event);
    await this.dataSource.transaction(async (manager) => {
      for (const notification of notifications) {
        await manager.save(manager.create(NotificationEntity, notification));
      }
      await manager.save(
        manager.create(ProcessedEventEntity, {
          eventId: event.eventId,
          eventType: event.eventType,
          entityId: event.entityId
        })
      );
    });
  }

  private async buildNotifications(event: EventEnvelope<Record<string, any>>): Promise<Partial<NotificationEntity>[]> {
    switch (event.eventType) {
      case "queue_joined":
        return [
          {
            userId: event.payload.userId,
            eventId: event.eventId,
            zoneId: event.payload.zoneId,
            title: "Queue joined",
            body: `You joined the dining queue for zone ${event.payload.zoneId}.`,
            readAt: null
          }
        ];
      case "queue_left":
        return [
          {
            userId: event.payload.userId,
            eventId: event.eventId,
            zoneId: event.payload.zoneId,
            title: "Queue left",
            body: `You left the dining queue for zone ${event.payload.zoneId}.`,
            readAt: null
          }
        ];
      case "reservation_created":
        return [
          {
            userId: event.payload.userId,
            eventId: event.eventId,
            zoneId: event.payload.zoneId,
            title: "Reservation created",
            body: `Reservation created for zone ${event.payload.zoneId}, seat ${event.payload.seatNumber}.`,
            readAt: null
          }
        ];
      case "reservation_cancelled":
        return [
          {
            userId: event.payload.userId,
            eventId: event.eventId,
            zoneId: event.payload.zoneId,
            title: "Reservation cancelled",
            body: `Reservation ${event.payload.reservationId} was cancelled.`,
            readAt: null
          }
        ];
      case "zone_overloaded": {
        const admins = await this.fetchAdminUsers();
        return admins.map((admin) => ({
          userId: admin.id,
          eventId: event.eventId,
          zoneId: event.payload.zoneId,
          title: "Zone overloaded",
          body: `Zone ${event.payload.zoneId} is overloaded with occupancy ${event.payload.currentOccupancy}.`,
          readAt: null
        }));
      }
      default:
        return [];
    }
  }

  private async fetchAdminUsers(): Promise<RemoteUser[]> {
    const baseUrl = process.env.USER_SERVICE_URL ?? "http://user-service:3001";
    const response = await axios.get<RemoteUser[]>(`${baseUrl}/users`, {
      headers: {
        [HEADER_SERVICE_TOKEN]: process.env.INTERNAL_SERVICE_TOKEN ?? "internal-service-token"
      }
    });
    return response.data.filter((user) =>
      ["dining_admin", "coworking_admin", "system_admin"].includes(user.role)
    );
  }
}

