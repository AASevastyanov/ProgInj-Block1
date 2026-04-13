import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import type { KafkaEventType } from "@qoms/shared";

@Entity({ schema: "queue_service", name: "outbox_events" })
export class OutboxEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "event_id", type: "uuid", unique: true })
  eventId!: string;

  @Column({ name: "event_type", type: "varchar", length: 128 })
  eventType!: KafkaEventType;

  @Column({ name: "entity_id", type: "varchar", length: 128 })
  entityId!: string;

  @Column({ name: "correlation_id", type: "varchar", length: 128 })
  correlationId!: string;

  @Column({ type: "jsonb" })
  payload!: Record<string, unknown>;

  @Column({ name: "published_at", type: "timestamptz", nullable: true })
  publishedAt!: Date | null;

  @Column({ type: "integer", default: 0 })
  attempts!: number;

  @Column({ name: "last_error", type: "text", nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}

