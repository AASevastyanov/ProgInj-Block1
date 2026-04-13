import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { ZoneStatus, ZoneType } from "@qoms/shared";

@Entity({ schema: "zone_management_service", name: "zones" })
export class ZoneEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "varchar", length: 64 })
  type!: ZoneType;

  @Column({ type: "varchar", length: 64, default: "open" })
  status!: ZoneStatus;

  @Column({ type: "integer" })
  capacity!: number;

  @Column({ name: "current_occupancy", type: "integer", default: 0 })
  currentOccupancy!: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

