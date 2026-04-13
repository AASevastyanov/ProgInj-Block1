export const KAFKA_EVENTS = [
  "occupancy_updated",
  "zone_status_changed",
  "zone_overloaded",
  "queue_joined",
  "queue_left",
  "queue_status_changed",
  "reservation_created",
  "reservation_cancelled"
] as const;

export type KafkaEventType = (typeof KAFKA_EVENTS)[number];

export interface EventEnvelope<TPayload = Record<string, unknown>> {
  eventId: string;
  eventType: KafkaEventType;
  version: number;
  occurredAt: string;
  sourceService: string;
  correlationId: string;
  entityId: string;
  payload: TPayload;
}

export function createEventEnvelope<TPayload>(params: {
  eventId: string;
  eventType: KafkaEventType;
  sourceService: string;
  correlationId: string;
  entityId: string;
  payload: TPayload;
  occurredAt?: string;
  version?: number;
}): EventEnvelope<TPayload> {
  return {
    eventId: params.eventId,
    eventType: params.eventType,
    version: params.version ?? 1,
    occurredAt: params.occurredAt ?? new Date().toISOString(),
    sourceService: params.sourceService,
    correlationId: params.correlationId,
    entityId: params.entityId,
    payload: params.payload
  };
}

