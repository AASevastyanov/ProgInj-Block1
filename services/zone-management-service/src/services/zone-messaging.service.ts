import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { KAFKA_EVENTS, type EventEnvelope } from "@qoms/shared";
import { Admin, Consumer, Kafka, Producer } from "kafkajs";
import { ZoneService } from "./zone.service";

@Injectable()
export class ZoneMessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZoneMessagingService.name);
  private readonly kafka = new Kafka({
    clientId: "zone-management-service",
    brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",")
  });

  private producer!: Producer;
  private consumer!: Consumer;
  private admin!: Admin;
  private outboxTimer?: NodeJS.Timeout;

  constructor(@Inject(ZoneService) private readonly zoneService: ZoneService) {}

  async onModuleInit(): Promise<void> {
    const topic = process.env.KAFKA_TOPIC ?? "queue-and-occupancy-events";
    this.producer = this.kafka.producer();
    this.admin = this.kafka.admin();
    this.consumer = this.kafka.consumer({ groupId: "zone-management-service-group" });
    await this.admin.connect();
    await this.admin.createTopics({
      waitForLeaders: true,
      topics: [{ topic, numPartitions: 1, replicationFactor: 1 }]
    });
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({ topic, fromBeginning: true });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) {
          return;
        }
        const event = JSON.parse(message.value.toString()) as EventEnvelope<Record<string, unknown>>;
        if (!KAFKA_EVENTS.includes(event.eventType)) {
          return;
        }
        if (event.eventType === "occupancy_updated") {
          await this.zoneService.handleOccupancyUpdated(event);
        }
      }
    });

    this.outboxTimer = setInterval(this.flushOutbox, 2000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.outboxTimer) {
      clearInterval(this.outboxTimer);
    }
    await this.admin?.disconnect();
    await this.consumer?.disconnect();
    await this.producer?.disconnect();
  }

  private readonly flushOutbox = async (): Promise<void> => {
    const topic = process.env.KAFKA_TOPIC ?? "queue-and-occupancy-events";
    const items = await this.zoneService.getPendingOutboxEvents();
    for (const item of items) {
      try {
        await this.producer.send({
          topic,
          messages: [
            {
              key: item.entityId,
              value: JSON.stringify(item.payload)
            }
          ]
        });
        await this.zoneService.markOutboxPublished(item.id);
      } catch (error) {
        this.logger.error(`Outbox publish failed for ${item.id}: ${(error as Error).message}`);
        await this.zoneService.markOutboxFailed(item.id, error as Error);
      }
    }
  };
}
