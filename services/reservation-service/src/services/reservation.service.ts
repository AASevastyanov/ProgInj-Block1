import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { HEADER_SERVICE_TOKEN, createEventEnvelope, type KafkaEventType, type RequestUserContext } from "@qoms/shared";
import axios from "axios";
import { Between, DataSource, IsNull, LessThan, Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { CreateReservationDto } from "../dto/reservation.dto";
import { OutboxEventEntity } from "../entities/outbox-event.entity";
import { ReservationEntity } from "../entities/reservation.entity";
import { ReservationCacheService } from "./reservation-cache.service";

type ZoneSummary = {
  id: string;
  type: string;
  status: string;
  capacity: number;
  rules?: {
    reservationEnabled: boolean;
    reservationSlotMinutes: number;
    reservationWindowDays: number;
  };
};

@Injectable()
export class ReservationService {
  constructor(
    @InjectRepository(ReservationEntity)
    private readonly reservationRepository: Repository<ReservationEntity>,
    @InjectRepository(OutboxEventEntity)
    private readonly outboxRepository: Repository<OutboxEventEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(ReservationCacheService) private readonly cacheService: ReservationCacheService
  ) {}

  async createReservation(dto: CreateReservationDto, user: RequestUserContext | null): Promise<Record<string, unknown>> {
    if (!user) {
      throw new BadRequestException("Missing user context");
    }
    await this.fetchUser(user.userId);
    const zone = await this.fetchZone(dto.zoneId);
    if (zone.type !== "coworking_zone") {
      throw new BadRequestException("Reservation is available only for coworking_zone");
    }
    if (zone.status === "closed") {
      throw new BadRequestException("Zone is closed");
    }
    if (!zone.rules?.reservationEnabled) {
      throw new BadRequestException("Reservations are disabled for this zone");
    }
    if (dto.seatNumber > zone.capacity) {
      throw new BadRequestException("Seat number exceeds zone capacity");
    }

    const slotStart = new Date(dto.slotStart);
    if (Number.isNaN(slotStart.getTime())) {
      throw new BadRequestException("Invalid slotStart");
    }
    const latestAllowed = new Date();
    latestAllowed.setDate(latestAllowed.getDate() + (zone.rules?.reservationWindowDays ?? 7));
    if (slotStart > latestAllowed) {
      throw new BadRequestException("Reservation exceeds allowed booking window");
    }
    const slotMinutes = zone.rules?.reservationSlotMinutes ?? 60;
    const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60 * 1000);

    const conflict = await this.reservationRepository.findOne({
      where: {
        zoneId: dto.zoneId,
        seatNumber: dto.seatNumber,
        status: "active",
        slotStart: Between(slotStart, slotEnd)
      }
    });
    if (conflict) {
      throw new BadRequestException("Selected seat is already reserved for this slot");
    }

    const correlationId = uuidv4();
    let reservationId = "";
    await this.dataSource.transaction(async (manager) => {
      const reservation = await manager.save(
        manager.create(ReservationEntity, {
          zoneId: dto.zoneId,
          userId: user.userId,
          seatNumber: dto.seatNumber,
          slotStart,
          slotEnd,
          status: "active",
          cancelledAt: null
        })
      );
      reservationId = reservation.id;
      await manager.save(
        manager.create(OutboxEventEntity, this.createOutbox("reservation_created", dto.zoneId, correlationId, {
          reservationId: reservation.id,
          zoneId: dto.zoneId,
          userId: user.userId,
          seatNumber: dto.seatNumber,
          slotStart: reservation.slotStart.toISOString(),
          slotEnd: reservation.slotEnd.toISOString()
        }))
      );
    });

    await this.invalidateReservationCache(dto.zoneId, slotStart.toISOString(), user.userId);
    const reservation = await this.reservationRepository.findOne({ where: { id: reservationId } });
    if (!reservation) {
      throw new NotFoundException("Reservation not found after creation");
    }
    return this.toReservationResponse(reservation);
  }

  async cancelReservation(id: string, user: RequestUserContext | null): Promise<Record<string, unknown>> {
    if (!user) {
      throw new BadRequestException("Missing user context");
    }
    const reservation = await this.reservationRepository.findOne({ where: { id } });
    if (!reservation || reservation.status !== "active") {
      throw new NotFoundException("Active reservation not found");
    }
    if (reservation.userId !== user.userId && user.role !== "system_admin") {
      throw new BadRequestException("Reservation belongs to another user");
    }

    const correlationId = uuidv4();
    await this.dataSource.transaction(async (manager) => {
      reservation.status = "cancelled";
      reservation.cancelledAt = new Date();
      await manager.save(reservation);
      await manager.save(
        manager.create(OutboxEventEntity, this.createOutbox("reservation_cancelled", reservation.zoneId, correlationId, {
          reservationId: reservation.id,
          zoneId: reservation.zoneId,
          userId: reservation.userId,
          seatNumber: reservation.seatNumber
        }))
      );
    });

    await this.invalidateReservationCache(reservation.zoneId, reservation.slotStart.toISOString(), reservation.userId);
    return {
      id: reservation.id,
      status: reservation.status,
      cancelledAt: reservation.cancelledAt
    };
  }

  async getMyReservations(user: RequestUserContext | null): Promise<Record<string, unknown>[]> {
    if (!user) {
      throw new BadRequestException("Missing user context");
    }
    const reservations = await this.reservationRepository.find({
      where: { userId: user.userId },
      order: { slotStart: "ASC" }
    });
    return reservations.map((reservation) => this.toReservationResponse(reservation));
  }

  async getReservationsByZone(zoneId: string, slotStart?: string): Promise<Record<string, unknown>[]> {
    const cacheKey = `reservation:availability:${zoneId}:${slotStart ?? "all"}`;
    const cached = await this.cacheService.getJson<Record<string, unknown>[]>(cacheKey);
    if (cached) {
      return cached;
    }
    const query = this.reservationRepository.createQueryBuilder("reservation").where("reservation.zone_id = :zoneId", { zoneId });
    if (slotStart) {
      query.andWhere("reservation.slot_start = :slotStart", { slotStart });
    }
    const reservations = await query.orderBy("reservation.slot_start", "ASC").getMany();
    const payload = reservations.map((reservation) => this.toReservationResponse(reservation));
    await this.cacheService.setJson(cacheKey, payload, 10);
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

  private toReservationResponse(reservation: ReservationEntity): Record<string, unknown> {
    return {
      id: reservation.id,
      zoneId: reservation.zoneId,
      userId: reservation.userId,
      seatNumber: reservation.seatNumber,
      slotStart: reservation.slotStart,
      slotEnd: reservation.slotEnd,
      status: reservation.status,
      createdAt: reservation.createdAt,
      cancelledAt: reservation.cancelledAt
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
      sourceService: "reservation-service",
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

  private async invalidateReservationCache(zoneId: string, slotStart: string, userId: string): Promise<void> {
    await this.cacheService.del(`reservation:availability:${zoneId}:all`, `reservation:availability:${zoneId}:${slotStart}`);
    await this.cacheService.del(`user:reservations:${userId}`);
  }
}
