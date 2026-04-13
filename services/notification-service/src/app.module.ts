import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RequestIdMiddleware } from "@qoms/backend-common";
import { HealthController } from "./controllers/health.controller";
import { NotificationsController } from "./controllers/notifications.controller";
import { NotificationEntity } from "./entities/notification.entity";
import { ProcessedEventEntity } from "./entities/processed-event.entity";
import { NotificationConsumerService } from "./services/notification-consumer.service";
import { NotificationService } from "./services/notification.service";

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
      schema: "notification_service",
      autoLoadEntities: true,
      synchronize: true
    }),
    TypeOrmModule.forFeature([NotificationEntity, ProcessedEventEntity])
  ],
  controllers: [HealthController, NotificationsController],
  providers: [NotificationService, NotificationConsumerService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}

