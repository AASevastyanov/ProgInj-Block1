import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RequestIdMiddleware } from "@qoms/backend-common";
import { HealthController } from "./controllers/health.controller";
import { ZonesController } from "./controllers/zones.controller";
import { OutboxEventEntity } from "./entities/outbox-event.entity";
import { ProcessedEventEntity } from "./entities/processed-event.entity";
import { ZoneRuleEntity } from "./entities/zone-rule.entity";
import { ZoneEntity } from "./entities/zone.entity";
import { ZoneCacheService } from "./services/zone-cache.service";
import { ZoneMessagingService } from "./services/zone-messaging.service";
import { ZoneService } from "./services/zone.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.POSTGRES_HOST ?? "localhost",
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      username: process.env.POSTGRES_USER ?? "qoms",
      password: process.env.POSTGRES_PASSWORD ?? "qoms",
      database: process.env.POSTGRES_DB ?? "qoms",
      schema: "zone_management_service",
      autoLoadEntities: true,
      synchronize: true
    }),
    TypeOrmModule.forFeature([ZoneEntity, ZoneRuleEntity, OutboxEventEntity, ProcessedEventEntity])
  ],
  controllers: [HealthController, ZonesController],
  providers: [ZoneService, ZoneCacheService, ZoneMessagingService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}

