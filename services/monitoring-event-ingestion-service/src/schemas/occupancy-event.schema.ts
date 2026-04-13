import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type OccupancyEventDocument = HydratedDocument<OccupancyEvent>;

@Schema({ collection: "occupancy_events", timestamps: true })
export class OccupancyEvent {
  @Prop({ type: String, required: true })
  eventId!: string;

  @Prop({ type: String, required: true })
  correlationId!: string;

  @Prop({ type: String, required: true })
  zoneId!: string;

  @Prop({ type: Number, required: true })
  occupancy!: number;

  @Prop({ type: String, required: true })
  source!: string;

  @Prop({ required: true, type: Object })
  rawPayload!: Record<string, unknown>;

  @Prop({ type: String, required: true, default: "pending" })
  publishStatus!: "pending" | "published" | "failed";

  @Prop({ type: Number, required: true, default: 0 })
  retryCount!: number;

  @Prop({ type: String })
  lastError?: string;

  @Prop({ type: Date, required: true })
  observedAt!: Date;

  @Prop({ type: Date })
  publishedAt?: Date;

  createdAt?: Date;

  updatedAt?: Date;
}

export const OccupancyEventSchema = SchemaFactory.createForClass(OccupancyEvent);
OccupancyEventSchema.index({ eventId: 1 }, { unique: true });
OccupancyEventSchema.index({ zoneId: 1, createdAt: -1 });
