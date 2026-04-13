import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({ schema: "zone_management_service", name: "zone_rules" })
export class ZoneRuleEntity {
  @PrimaryColumn({ name: "zone_id", type: "uuid" })
  zoneId!: string;

  @Column({ name: "queue_enabled", type: "boolean", default: false })
  queueEnabled!: boolean;

  @Column({ name: "reservation_enabled", type: "boolean", default: false })
  reservationEnabled!: boolean;

  @Column({ name: "overload_threshold_pct", type: "integer", default: 85 })
  overloadThresholdPct!: number;

  @Column({ name: "estimated_service_minutes_per_person", type: "integer", default: 3 })
  estimatedServiceMinutesPerPerson!: number;

  @Column({ name: "reservation_slot_minutes", type: "integer", default: 60 })
  reservationSlotMinutes!: number;

  @Column({ name: "reservation_window_days", type: "integer", default: 7 })
  reservationWindowDays!: number;

  @Column({ name: "max_queue_size", type: "integer", default: 100 })
  maxQueueSize!: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

