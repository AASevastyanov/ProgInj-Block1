import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { Role } from "@qoms/shared";
import { RoleEntity } from "./role.entity";

@Entity({ schema: "user_service", name: "users" })
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255, unique: true })
  email!: string;

  @Column({ name: "full_name", type: "varchar", length: 255 })
  fullName!: string;

  @Column({ name: "password_hash", type: "varchar", length: 255 })
  passwordHash!: string;

  @Column({ name: "role_name", type: "varchar", length: 64 })
  roleName!: Role;

  @ManyToOne(() => RoleEntity, { eager: true, nullable: false })
  @JoinColumn({ name: "role_name", referencedColumnName: "name" })
  role!: RoleEntity;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

