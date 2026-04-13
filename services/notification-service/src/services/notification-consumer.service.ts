import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { KAFKA_EVENTS, type EventEnvelope } from "@qoms/shared";
import { Admin, Consumer, Kafka } from "kafkajs";
import { NotificationService } from "./notification.service";

@Injectable()
export class NotificationConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationConsumerService.name);
  private readonly kafka = new Kafka({
    clientId: "notification-service",
    brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",")
  });

  private consumer!: Consumer;
  private admin!: Admin;

  constructor(@Inject(NotificationService) private readonly notificationService: NotificationService) {}

  async onModuleInit(): Promise<void> {
    const topic = process.env.KAFKA_TOPIC ?? "queue-and-occupancy-events";
    this.admin = this.kafka.admin();
    this.consumer = this.kafka.consumer({ groupId: "notification-service-group" });
    await this.admin.connect();
    await this.admin.createTopics({
      waitForLeaders: true,
      topics: [{ topic, numPartitions: 1, replicationFactor: 1 }]
    });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic, fromBeginning: true });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) {
          return;
        }
        try {
          const event = JSON.parse(message.value.toString()) as EventEnvelope<Record<string, any>>;
          if (!KAFKA_EVENTS.includes(event.eventType)) {
            return;
          }
          await this.notificationService.handleEvent(event);
        } catch (error) {
          this.logger.error(`Notification event handling failed: ${(error as Error).message}`);
        }
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.admin?.disconnect();
    await this.consumer?.disconnect();
  }
}
