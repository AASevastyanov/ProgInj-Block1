import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RequestIdMiddleware } from "@qoms/backend-common";
import { HealthController } from "./controllers/health.controller";
import { ReservationController } from "./controllers/reservation.controller";
import { OutboxEventEntity } from "./entities/outbox-event.entity";
import { ReservationEntity } from "./entities/reservation.entity";
import { ReservationCacheService } from "./services/reservation-cache.service";
import { ReservationMessagingService } from "./services/reservation-messaging.service";
import { ReservationService } from "./services/reservation.service";

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
      schema: "reservation_service",
      autoLoadEntities: true,
      synchronize: true
    }),
    TypeOrmModule.forFeature([ReservationEntity, OutboxEventEntity])
  ],
  controllers: [HealthController, ReservationController],
  providers: [ReservationService, ReservationCacheService, ReservationMessagingService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}

