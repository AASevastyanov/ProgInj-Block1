import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { createEventEnvelope, type EventEnvelope, type KafkaEventType, type ZoneStatus } from "@qoms/shared";
import { DataSource, IsNull, LessThan, Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { CreateZoneDto, UpdateZoneDto, UpdateZoneRulesDto } from "../dto/zone.dto";
import { OutboxEventEntity } from "../entities/outbox-event.entity";
import { ProcessedEventEntity } from "../entities/processed-event.entity";
import { ZoneRuleEntity } from "../entities/zone-rule.entity";
import { ZoneEntity } from "../entities/zone.entity";
import { ZoneCacheService } from "./zone-cache.service";

@Injectable()
export class ZoneService {
  private readonly logger = new Logger(ZoneService.name);

  constructor(
    @InjectRepository(ZoneEntity)
    private readonly zoneRepository: Repository<ZoneEntity>,
    @InjectRepository(ZoneRuleEntity)
    private readonly zoneRuleRepository: Repository<ZoneRuleEntity>,
    @InjectRepository(OutboxEventEntity)
    private readonly outboxRepository: Repository<OutboxEventEntity>,
    @InjectRepository(ProcessedEventEntity)
    private readonly processedRepository: Repository<ProcessedEventEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(ZoneCacheService) private readonly cacheService: ZoneCacheService
  ) {}

  async listZones(): Promise<Record<string, unknown>[]> {
    const cached = await this.cacheService.getJson<Record<string, unknown>[]>("zones:list");
    if (cached) {
      return cached;
    }
    const zones = await this.zoneRepository.find({ order: { createdAt: "ASC" } });
    const rules = await this.zoneRuleRepository.find();
    const rulesMap = new Map(rules.map((rule) => [rule.zoneId, rule]));
    const payload = zones.map((zone) => this.toZoneResponse(zone, rulesMap.get(zone.id)));
    await this.cacheService.setJson("zones:list", payload, 10);
    return payload;
  }

  async getZone(id: string): Promise<Record<string, any>> {
    const cached = await this.cacheService.getJson<Record<string, any>>(`zone:summary:${id}`);
    if (cached) {
      return cached;
    }
    const zone = await this.getZoneEntity(id);
    const rules = await this.zoneRuleRepository.findOne({ where: { zoneId: id } });
    const payload = this.toZoneResponse(zone, rules ?? undefined);
    await this.cacheService.setJson(`zone:summary:${id}`, payload, 10);
    return payload;
  }

  async getZoneStatus(id: string): Promise<Record<string, unknown>> {
    const cached = await this.cacheService.getJson<Record<string, unknown>>(`zone:status:${id}`);
    if (cached) {
      return cached;
    }
    const zone = await this.getZoneEntity(id);
    const payload = {
      zoneId: zone.id,
      status: zone.status,
      currentOccupancy: zone.currentOccupancy,
      capacity: zone.capacity,
      occupancyPct: Math.round((zone.currentOccupancy / zone.capacity) * 100)
    };
    await this.cacheService.setJson(`zone:status:${id}`, payload, 5);
    return payload;
  }

  async getZoneRules(id: string): Promise<ZoneRuleEntity> {
    const rules = await this.zoneRuleRepository.findOne({ where: { zoneId: id } });
    if (!rules) {
      throw new NotFoundException("Zone rules not found");
    }
    return rules;
  }

  async createZone(dto: CreateZoneDto, actorId: string): Promise<Record<string, unknown>> {
    const correlationId = uuidv4();
    const zoneId = uuidv4();
    await this.dataSource.transaction(async (manager) => {
      const zone = manager.create(ZoneEntity, {
        id: zoneId,
        name: dto.name,
        type: dto.type,
        capacity: dto.capacity,
        status: dto.status ?? "open",
        currentOccupancy: 0
      });
      await manager.save(zone);
      await manager.save(
        manager.create(ZoneRuleEntity, {
          zoneId,
          ...dto.rules
        })
      );
      await manager.save(
        manager.create(OutboxEventEntity, this.createOutbox("zone_status_changed", zoneId, correlationId, {
          zoneId,
          status: zone.status,
          currentOccupancy: zone.currentOccupancy,
          actorId
        }))
      );
    });
    await this.invalidateZoneCache(zoneId);
    return this.getZone(zoneId);
  }

  async updateZone(id: string, dto: UpdateZoneDto, actorId: string): Promise<Record<string, unknown>> {
    const correlationId = uuidv4();
    await this.dataSource.transaction(async (manager) => {
      const zone = await manager.findOne(ZoneEntity, { where: { id } });
      if (!zone) {
        throw new NotFoundException("Zone not found");
      }
      Object.assign(zone, dto);
      await manager.save(zone);
      await manager.save(
        manager.create(OutboxEventEntity, this.createOutbox("zone_status_changed", zone.id, correlationId, {
          zoneId: zone.id,
          status: zone.status,
          currentOccupancy: zone.currentOccupancy,
          actorId
        }))
      );
    });
    await this.invalidateZoneCache(id);
    return this.getZone(id);
  }

  async updateZoneRules(id: string, dto: UpdateZoneRulesDto, actorId: string): Promise<ZoneRuleEntity> {
    const correlationId = uuidv4();
    let updatedRules!: ZoneRuleEntity;
    await this.dataSource.transaction(async (manager) => {
      const rules = await manager.findOne(ZoneRuleEntity, { where: { zoneId: id } });
      if (!rules) {
        throw new NotFoundException("Zone rules not found");
      }
      Object.assign(rules, dto);
      updatedRules = await manager.save(rules);
      await manager.save(
        manager.create(OutboxEventEntity, this.createOutbox("zone_status_changed", id, correlationId, {
          zoneId: id,
          actorId,
          rulesUpdated: true
        }))
      );
    });
    await this.invalidateZoneCache(id);
    return updatedRules;
  }

  async handleOccupancyUpdated(event: EventEnvelope<Record<string, any>>): Promise<void> {
    const alreadyProcessed = await this.processedRepository.findOne({ where: { eventId: event.eventId } });
    if (alreadyProcessed) {
      return;
    }

    const zoneId = String(event.payload.zoneId ?? event.entityId);
    const occupancy = Number(event.payload.occupancy ?? event.payload.currentOccupancy ?? 0);

    await this.dataSource.transaction(async (manager) => {
      const zone = await manager.findOne(ZoneEntity, { where: { id: zoneId } });
      if (!zone) {
        this.logger.warn(`Ignoring occupancy event for unknown zone ${zoneId}`);
        return;
      }

      const rules = await manager.findOne(ZoneRuleEntity, { where: { zoneId } });
      const previousStatus = zone.status;
      zone.currentOccupancy = Math.max(0, occupancy);

      if (zone.status !== "closed") {
        const occupancyPct = Math.round((zone.currentOccupancy / zone.capacity) * 100);
        if (rules && occupancyPct >= rules.overloadThresholdPct) {
          zone.status = "overloaded";
        } else if (zone.status === "overloaded") {
          zone.status = "open";
        }
      }

      await manager.save(zone);
      await manager.save(
        manager.create(ProcessedEventEntity, {
          eventId: event.eventId,
          eventType: event.eventType,
          entityId: zone.id
        })
      );

      await manager.save(
        manager.create(OutboxEventEntity, this.createOutbox("zone_status_changed", zone.id, event.correlationId, {
          zoneId: zone.id,
          status: zone.status,
          currentOccupancy: zone.currentOccupancy,
          sourceEventId: event.eventId
        }))
      );

      if (previousStatus !== "overloaded" && zone.status === "overloaded") {
        await manager.save(
          manager.create(OutboxEventEntity, this.createOutbox("zone_overloaded", zone.id, event.correlationId, {
            zoneId: zone.id,
            status: zone.status,
            currentOccupancy: zone.currentOccupancy,
            sourceEventId: event.eventId
          }))
        );
      }
    });

    await this.invalidateZoneCache(zoneId);
  }

  async getPendingOutboxEvents(limit = 25): Promise<OutboxEventEntity[]> {
    return this.outboxRepository.find({
      where: {
        publishedAt: IsNull(),
        attempts: LessThan(5)
      },
      order: {
        createdAt: "ASC"
      },
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

  private async getZoneEntity(id: string): Promise<ZoneEntity> {
    const zone = await this.zoneRepository.findOne({ where: { id } });
    if (!zone) {
      throw new NotFoundException("Zone not found");
    }
    return zone;
  }

  private toZoneResponse(zone: ZoneEntity, rules?: ZoneRuleEntity): Record<string, unknown> {
    return {
      id: zone.id,
      name: zone.name,
      type: zone.type,
      status: zone.status,
      capacity: zone.capacity,
      currentOccupancy: zone.currentOccupancy,
      occupancyPct: Math.round((zone.currentOccupancy / zone.capacity) * 100),
      rules: rules
        ? {
            queueEnabled: rules.queueEnabled,
            reservationEnabled: rules.reservationEnabled,
            overloadThresholdPct: rules.overloadThresholdPct,
            estimatedServiceMinutesPerPerson: rules.estimatedServiceMinutesPerPerson,
            reservationSlotMinutes: rules.reservationSlotMinutes,
            reservationWindowDays: rules.reservationWindowDays,
            maxQueueSize: rules.maxQueueSize
          }
        : null,
      createdAt: zone.createdAt,
      updatedAt: zone.updatedAt
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
      sourceService: "zone-management-service",
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

  private async invalidateZoneCache(zoneId: string): Promise<void> {
    await this.cacheService.del("zones:list", `zone:summary:${zoneId}`, `zone:status:${zoneId}`);
  }
}
