import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import type { KafkaEventType } from "@qoms/shared";

@Entity({ schema: "zone_management_service", name: "processed_events" })
export class ProcessedEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "event_id", type: "uuid", unique: true })
  eventId!: string;

  @Column({ name: "event_type", type: "varchar", length: 128 })
  eventType!: KafkaEventType;

  @Column({ name: "entity_id", type: "varchar", length: 128 })
  entityId!: string;

  @CreateDateColumn({ name: "processed_at", type: "timestamptz" })
  processedAt!: Date;
}
