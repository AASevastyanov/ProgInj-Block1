import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Kafka, Producer } from "kafkajs";
import { QueueService } from "./queue.service";

@Injectable()
export class QueueMessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueMessagingService.name);
  private readonly kafka = new Kafka({
    clientId: "queue-service",
    brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",")
  });

  private producer!: Producer;
  private outboxTimer?: NodeJS.Timeout;

  constructor(@Inject(QueueService) private readonly queueService: QueueService) {}

  async onModuleInit(): Promise<void> {
    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.outboxTimer = setInterval(this.flushOutbox, 2000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.outboxTimer) {
      clearInterval(this.outboxTimer);
    }
    await this.producer?.disconnect();
  }

  private readonly flushOutbox = async (): Promise<void> => {
    const topic = process.env.KAFKA_TOPIC ?? "queue-and-occupancy-events";
    const items = await this.queueService.getPendingOutboxEvents();
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
        await this.queueService.markOutboxPublished(item.id);
      } catch (error) {
        this.logger.error(`Outbox publish failed for ${item.id}: ${(error as Error).message}`);
        await this.queueService.markOutboxFailed(item.id, error as Error);
      }
    }
  };
}
