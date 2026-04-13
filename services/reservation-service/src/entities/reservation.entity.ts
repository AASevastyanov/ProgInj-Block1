import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ schema: "reservation_service", name: "reservations" })
export class ReservationEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "zone_id", type: "uuid" })
  zoneId!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "seat_number", type: "integer" })
  seatNumber!: number;

  @Column({ name: "slot_start", type: "timestamptz" })
  slotStart!: Date;

  @Column({ name: "slot_end", type: "timestamptz" })
  slotEnd!: Date;

  @Column({ type: "varchar", length: 32, default: "active" })
  status!: "active" | "cancelled";

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "cancelled_at", type: "timestamptz", nullable: true })
  cancelledAt!: Date | null;
}

