import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type TelemetrySnapshotDocument = HydratedDocument<TelemetrySnapshot>;

@Schema({ collection: "telemetry_snapshots", timestamps: true })
export class TelemetrySnapshot {
  @Prop({ type: String, required: true, unique: true })
  zoneId!: string;

  @Prop({ type: Number, required: true })
  occupancy!: number;

  @Prop({ type: String, required: true })
  source!: string;

  @Prop({ type: Date, required: true })
  observedAt!: Date;

  @Prop({ type: Object, required: true })
  rawPayload!: Record<string, unknown>;

  createdAt?: Date;

  updatedAt?: Date;
}

export const TelemetrySnapshotSchema = SchemaFactory.createForClass(TelemetrySnapshot);
