import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ schema: "queue_service", name: "queue_entries" })
export class QueueEntryEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "zone_id", type: "uuid" })
  zoneId!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ type: "varchar", length: 32, default: "active" })
  status!: "active" | "left";

  @CreateDateColumn({ name: "joined_at", type: "timestamptz" })
  joinedAt!: Date;

  @Column({ name: "left_at", type: "timestamptz", nullable: true })
  leftAt!: Date | null;
}

