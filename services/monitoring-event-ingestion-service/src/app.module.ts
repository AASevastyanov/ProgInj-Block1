import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { RequestIdMiddleware } from "@qoms/backend-common";
import { HealthController } from "./controllers/health.controller";
import { MonitoringController } from "./controllers/monitoring.controller";
import { OccupancyEvent, OccupancyEventSchema } from "./schemas/occupancy-event.schema";
import { TelemetrySnapshot, TelemetrySnapshotSchema } from "./schemas/telemetry-snapshot.schema";
import { MonitoringService } from "./services/monitoring.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    MongooseModule.forRoot(process.env.MONGO_URI ?? "mongodb://localhost:27017/qoms"),
    MongooseModule.forFeature([
      { name: OccupancyEvent.name, schema: OccupancyEventSchema },
      { name: TelemetrySnapshot.name, schema: TelemetrySnapshotSchema }
    ])
  ],
  controllers: [HealthController, MonitoringController],
  providers: [MonitoringService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}

