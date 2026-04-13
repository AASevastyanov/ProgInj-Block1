export const ROLES = [
  "student",
  "employee",
  "dining_admin",
  "coworking_admin",
  "system_admin"
] as const;

export type Role = (typeof ROLES)[number];

export const ZONE_TYPES = ["dining_zone", "coworking_zone"] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

export const ZONE_STATUSES = ["open", "closed", "overloaded"] as const;
export type ZoneStatus = (typeof ZONE_STATUSES)[number];

export interface JwtClaims {
  sub: string;
  email: string;
  role: Role;
}

export interface ZoneRulesPayload {
  queueEnabled: boolean;
  reservationEnabled: boolean;
  overloadThresholdPct: number;
  estimatedServiceMinutesPerPerson: number;
  reservationSlotMinutes: number;
  reservationWindowDays: number;
  maxQueueSize: number;
}

export interface RequestUserContext {
  userId: string;
  role: Role;
  email?: string;
}

export interface NotificationMessagePayload {
  userId: string;
  title: string;
  body: string;
  zoneId?: string;
}

