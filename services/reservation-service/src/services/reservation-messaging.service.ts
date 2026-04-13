import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Kafka, Producer } from "kafkajs";
import { ReservationService } from "./reservation.service";

@Injectable()
export class ReservationMessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReservationMessagingService.name);
  private readonly kafka = new Kafka({
    clientId: "reservation-service",
    brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",")
  });

  private producer!: Producer;
  private outboxTimer?: NodeJS.Timeout;

  constructor(@Inject(ReservationService) private readonly reservationService: ReservationService) {}

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
    const items = await this.reservationService.getPendingOutboxEvents();
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
        await this.reservationService.markOutboxPublished(item.id);
      } catch (error) {
        this.logger.error(`Outbox publish failed for ${item.id}: ${(error as Error).message}`);
        await this.reservationService.markOutboxFailed(item.id, error as Error);
      }
    }
  };
}
