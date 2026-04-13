import { SetMetadata } from "@nestjs/common";
import type { Role } from "@qoms/shared";

export const IS_PUBLIC_KEY = "isPublic";
export const PUBLIC_ROUTE = () => SetMetadata(IS_PUBLIC_KEY, true);

export const GATEWAY_ROLES_KEY = "gatewayRoles";
export const GatewayRoles = (...roles: Role[]) => SetMetadata(GATEWAY_ROLES_KEY, roles);

export const RATE_POLICY_KEY = "ratePolicy";
export type RatePolicyName =
  | "default_read"
  | "default_write"
  | "login"
  | "join_queue"
  | "create_reservation"
  | "admin_write"
  | "occupancy_ingest";

export const RatePolicy = (policy: RatePolicyName) => SetMetadata(RATE_POLICY_KEY, policy);

