import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { HEADER_SERVICE_TOKEN, createEventEnvelope, type KafkaEventType, type RequestUserContext } from "@qoms/shared";
import axios from "axios";
import { DataSource, IsNull, LessThan, Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { OutboxEventEntity } from "../entities/outbox-event.entity";
import { QueueEntryEntity } from "../entities/queue-entry.entity";
import { QueueCacheService } from "./queue-cache.service";

type ZoneSummary = {
  id: string;
  type: string;
  status: string;
  capacity: number;
  rules?: {
    queueEnabled: boolean;
    maxQueueSize: number;
    estimatedServiceMinutesPerPerson: number;
  };
};

@Injectable()
export class QueueService {
  constructor(
    @InjectRepository(QueueEntryEntity)
    private readonly queueRepository: Repository<QueueEntryEntity>,
    @InjectRepository(OutboxEventEntity)
    private readonly outboxRepository: Repository<OutboxEventEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(QueueCacheService) private readonly cacheService: QueueCacheService
  ) {}

  async joinQueue(zoneId: string, user: RequestUserContext | null): Promise<Record<string, unknown>> {
    if (!user) {
      throw new BadRequestException("Missing user context");
    }
    const correlationId = uuidv4();
    const zone = await this.fetchZone(zoneId);
    await this.fetchUser(user.userId);

    if (zone.type !== "dining_zone") {
      throw new BadRequestException("Queue is available only for dining_zone");
    }
    if (zone.status === "closed") {
      throw new BadRequestException("Zone is closed");
    }
    if (!zone.rules?.queueEnabled) {
      throw new BadRequestException("Queue is disabled for this zone");
    }

    const activeCount = await this.queueRepository.count({ where: { zoneId, status: "active" } });
    if (activeCount >= (zone.rules?.maxQueueSize ?? 100)) {
      throw new BadRequestException("Queue is full");
    }

    const existing = await this.queueRepository.findOne({ where: { zoneId, userId: user.userId, status: "active" } });
    if (existing) {
      return this.buildQueueState(zone, existing, activeCount);
    }

    let createdEntryId = "";
    await this.dataSource.transaction(async (manager) => {
      const entry = await manager.save(
        manager.create(QueueEntryEntity, {
          zoneId,
          userId: user.userId,
          status: "active",
          leftAt: null
        })
      );
      createdEntryId = entry.id;
      await manager.save(
        manager.create(OutboxEventEntity, this.createOutbox("queue_joined", zoneId, correlationId, {
          zoneId,
          queueEntryId: entry.id,
          userId: user.userId
        }))
      );
      await manager.save(
        manager.create(OutboxEventEntity, this.createOutbox("queue_status_changed", zoneId, correlationId, {
          zoneId,
          queueLength: activeCount + 1
        }))
      );
    });

    await this.invalidateQueueCache(zoneId, user.userId);
    const entry = await this.queueRepository.findOne({ where: { id: createdEntryId } });
    if (!entry) {
      throw new NotFoundException("Queue entry not found after creation");
    }
    return this.buildQueueState(zone, entry, activeCount + 1);
  }

  async leaveQueue(zoneId: string, user: RequestUserContext | null): Promise<Record<string, unknown>> {
    if (!user) {
      throw new BadRequestException("Missing user context");
    }
    const zone = await this.fetchZone(zoneId);
    const correlationId = uuidv4();
    const entry = await this.queueRepository.findOne({ where: { zoneId, userId: user.userId, status: "active" } });
    if (!entry) {
      throw new NotFoundException("Active queue entry not found");
    }

    const nextCount = Math.max(0, (await this.queueRepository.count({ where: { zoneId, status: "active" } })) - 1);
    await this.dataSource.transaction(async (manager) => {
      entry.status = "left";
      entry.leftAt = new Date();
      await manager.save(entry);
      await manager.save(
        manager.create(OutboxEventEntity, this.createOutbox("queue_left", zoneId, correlationId, {
          zoneId,
          queueEntryId: entry.id,
          userId: user.userId
        }))
      );
      await manager.save(
        manager.create(OutboxEventEntity, this.createOutbox("queue_status_changed", zoneId, correlationId, {
          zoneId,
          queueLength: nextCount
        }))
      );
    });

    await this.invalidateQueueCache(zoneId, user.userId);
    return {
      zoneId,
      userId: user.userId,
      status: "left"
    };
  }

  async getMyQueueState(zoneId: string, user: RequestUserContext | null): Promise<Record<string, unknown>> {
    if (!user) {
      throw new BadRequestException("Missing user context");
    }
    const cacheKey = `queue:position:${zoneId}:${user.userId}`;
    const cached = await this.cacheService.getJson<Record<string, unknown>>(cacheKey);
    if (cached) {
      return cached;
    }

    const zone = await this.fetchZone(zoneId);
    const entry = await this.queueRepository.findOne({
      where: { zoneId, userId: user.userId, status: "active" }
    });
    if (!entry) {
      return {
        zoneId,
        userId: user.userId,
        inQueue: false
      };
    }
    const state = await this.buildQueueState(zone, entry);
    await this.cacheService.setJson(cacheKey, state, 5);
    return state;
  }

  async getQueueState(zoneId: string): Promise<Record<string, unknown>> {
    const cacheKey = `queue:summary:${zoneId}`;
    const cached = await this.cacheService.getJson<Record<string, unknown>>(cacheKey);
    if (cached) {
      return cached;
    }
    const activeCount = await this.queueRepository.count({ where: { zoneId, status: "active" } });
    const payload = {
      zoneId,
      queueLength: activeCount
    };
    await this.cacheService.setJson(cacheKey, payload, 5);
    return payload;
  }

  async getPendingOutboxEvents(limit = 25): Promise<OutboxEventEntity[]> {
    return this.outboxRepository.find({
      where: { publishedAt: IsNull(), attempts: LessThan(5) },
      order: { createdAt: "ASC" },
      take: limit
    });
  }

  async markOutboxPublished(id: string): Promise<void> {
    await this.outboxRepository.update({ id }, { publishedAt: new Date(), attempts: 0, lastError: null });
  }

  async markOutboxFailed(id: string, error: Error): Promise<void> {
    const item = await this.outboxRepository.findOne({ where: { id } });
    if (!item) {
      return;
    }
    await this.outboxRepository.update(
      { id },
      {
        attempts: item.attempts + 1,
        lastError: error.message
      }
    );
  }

  private async fetchZone(zoneId: string): Promise<ZoneSummary> {
    const baseUrl = process.env.ZONE_MANAGEMENT_SERVICE_URL ?? "http://zone-management-service:3002";
    const response = await axios.get<ZoneSummary>(`${baseUrl}/zones/${zoneId}`, {
      headers: {
        [HEADER_SERVICE_TOKEN]: process.env.INTERNAL_SERVICE_TOKEN ?? "internal-service-token"
      }
    });
    return response.data;
  }

  private async fetchUser(userId: string): Promise<void> {
    const baseUrl = process.env.USER_SERVICE_URL ?? "http://user-service:3001";
    await axios.get(`${baseUrl}/users/${userId}`, {
      headers: {
        [HEADER_SERVICE_TOKEN]: process.env.INTERNAL_SERVICE_TOKEN ?? "internal-service-token"
      }
    });
  }

  private async buildQueueState(
    zone: ZoneSummary,
    entry: QueueEntryEntity,
    knownQueueLength?: number
  ): Promise<Record<string, unknown>> {
    const position = await this.queueRepository
      .createQueryBuilder("entry")
      .where("entry.zone_id = :zoneId", { zoneId: entry.zoneId })
      .andWhere("entry.status = 'active'")
      .andWhere("entry.joined_at <= :joinedAt", { joinedAt: entry.joinedAt.toISOString() })
      .getCount();
    const queueLength = knownQueueLength ?? (await this.queueRepository.count({ where: { zoneId: entry.zoneId, status: "active" } }));
    return {
      zoneId: entry.zoneId,
      queueEntryId: entry.id,
      userId: entry.userId,
      inQueue: true,
      position,
      queueLength,
      estimatedWaitMinutes: Math.max(0, position - 1) * (zone.rules?.estimatedServiceMinutesPerPerson ?? 3),
      joinedAt: entry.joinedAt
    };
  }

  private createOutbox(
    eventType: KafkaEventType,
    entityId: string,
    correlationId: string,
    payload: Record<string, unknown>
  ): Partial<OutboxEventEntity> {
    const event = createEventEnvelope({
      eventId: uuidv4(),
      eventType,
      sourceService: "queue-service",
      correlationId,
      entityId,
      payload
    });
    return {
      eventId: event.eventId,
      eventType: event.eventType,
      entityId: event.entityId,
      correlationId: event.correlationId,
      payload: event as unknown as Record<string, unknown>,
      publishedAt: null,
      attempts: 0,
      lastError: null
    };
  }

  private async invalidateQueueCache(zoneId: string, userId: string): Promise<void> {
    await this.cacheService.del(`queue:summary:${zoneId}`, `queue:position:${zoneId}:${userId}`);
  }
}
