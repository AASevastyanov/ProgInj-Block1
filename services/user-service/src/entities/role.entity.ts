import { Column, Entity, PrimaryColumn } from "typeorm";
import type { Role } from "@qoms/shared";

@Entity({ schema: "user_service", name: "roles" })
export class RoleEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  name!: Role;

  @Column({ type: "varchar", length: 255 })
  description!: string;
}

