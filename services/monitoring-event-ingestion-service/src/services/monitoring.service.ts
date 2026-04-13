import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createEventEnvelope } from "@qoms/shared";
import { Admin, Kafka, Producer } from "kafkajs";
import { Model } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { CreateOccupancyEventDto } from "../dto/occupancy-event.dto";
import { OccupancyEvent, type OccupancyEventDocument } from "../schemas/occupancy-event.schema";
import { TelemetrySnapshot, type TelemetrySnapshotDocument } from "../schemas/telemetry-snapshot.schema";

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitoringService.name);
  private readonly kafka = new Kafka({
    clientId: "monitoring-event-ingestion-service",
    brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",")
  });

  private producer!: Producer;
  private admin!: Admin;
  private retryTimer?: NodeJS.Timeout;

  constructor(
    @InjectModel(OccupancyEvent.name)
    private readonly occupancyEventModel: Model<OccupancyEventDocument>,
    @InjectModel(TelemetrySnapshot.name)
    private readonly telemetrySnapshotModel: Model<TelemetrySnapshotDocument>
  ) {}

  async onModuleInit(): Promise<void> {
    const topic = process.env.KAFKA_TOPIC ?? "queue-and-occupancy-events";
    this.admin = this.kafka.admin();
    this.producer = this.kafka.producer();
    await this.admin.connect();
    await this.admin.createTopics({
      waitForLeaders: true,
      topics: [{ topic, numPartitions: 1, replicationFactor: 1 }]
    });
    await this.producer.connect();
    this.retryTimer = setInterval(this.retryPendingPublishes, 3000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
    }
    await this.admin?.disconnect();
    await this.producer?.disconnect();
  }

  async ingestEvent(dto: CreateOccupancyEventDto): Promise<Record<string, unknown>> {
    const eventId = uuidv4();
    const correlationId = uuidv4();
    const observedAt = dto.observedAt ? new Date(dto.observedAt) : new Date();
    const source = dto.source ?? "admin_web";
    const rawPayload = {
      zoneId: dto.zoneId,
      occupancy: dto.occupancy,
      source,
      observedAt: observedAt.toISOString()
    };

    const savedEvent = await this.occupancyEventModel.create({
      eventId,
      correlationId,
      zoneId: dto.zoneId,
      occupancy: dto.occupancy,
      source,
      rawPayload,
      publishStatus: "pending",
      retryCount: 0,
      observedAt
    });

    await this.telemetrySnapshotModel.findOneAndUpdate(
      { zoneId: dto.zoneId },
      {
        zoneId: dto.zoneId,
        occupancy: dto.occupancy,
        source,
        observedAt,
        rawPayload
      },
      { upsert: true, new: true }
    );

    await this.tryPublish(savedEvent);
    return {
      eventId,
      correlationId,
      zoneId: dto.zoneId,
      occupancy: dto.occupancy,
      publishStatus: savedEvent.publishStatus
    };
  }

  async getHistory(zoneId: string): Promise<Record<string, unknown>[]> {
    const items = await this.occupancyEventModel.find({ zoneId }).sort({ createdAt: -1 }).limit(100).lean();
    return items.map((item) => ({
      eventId: item.eventId,
      correlationId: item.correlationId,
      zoneId: item.zoneId,
      occupancy: item.occupancy,
      source: item.source,
      observedAt: item.observedAt,
      publishStatus: item.publishStatus,
      retryCount: item.retryCount,
      lastError: item.lastError ?? null,
      createdAt: item.createdAt
    }));
  }

  async getLatest(zoneId: string): Promise<Record<string, unknown> | null> {
    const snapshot = await this.telemetrySnapshotModel.findOne({ zoneId }).lean();
    if (!snapshot) {
      return null;
    }
    return {
      zoneId: snapshot.zoneId,
      occupancy: snapshot.occupancy,
      source: snapshot.source,
      observedAt: snapshot.observedAt,
      updatedAt: snapshot.updatedAt
    };
  }

  private readonly retryPendingPublishes = async (): Promise<void> => {
    const items = await this.occupancyEventModel
      .find({
        publishStatus: { $in: ["pending", "failed"] },
        retryCount: { $lt: 5 }
      })
      .sort({ createdAt: 1 })
      .limit(20);

    for (const item of items) {
      await this.tryPublish(item);
    }
  };

  private async tryPublish(eventDoc: OccupancyEventDocument): Promise<void> {
    const envelope = createEventEnvelope({
      eventId: eventDoc.eventId,
      eventType: "occupancy_updated",
      sourceService: "monitoring-event-ingestion-service",
      correlationId: eventDoc.correlationId,
      entityId: eventDoc.zoneId,
      payload: {
        zoneId: eventDoc.zoneId,
        occupancy: eventDoc.occupancy,
        source: eventDoc.source,
        sourceEventId: eventDoc.eventId,
        observedAt: eventDoc.observedAt.toISOString()
      }
    });

    try {
      await this.producer.send({
        topic: process.env.KAFKA_TOPIC ?? "queue-and-occupancy-events",
        messages: [
          {
            key: eventDoc.zoneId,
            value: JSON.stringify(envelope)
          }
        ]
      });
      eventDoc.publishStatus = "published";
      eventDoc.publishedAt = new Date();
      eventDoc.lastError = undefined;
      await eventDoc.save();
    } catch (error) {
      eventDoc.publishStatus = "failed";
      eventDoc.retryCount += 1;
      eventDoc.lastError = (error as Error).message;
      await eventDoc.save();
      this.logger.error(`Kafka publish failed for occupancy event ${eventDoc.eventId}: ${(error as Error).message}`);
    }
  }
}
