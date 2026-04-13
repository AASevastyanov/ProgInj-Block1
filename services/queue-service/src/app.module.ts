import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RequestIdMiddleware } from "@qoms/backend-common";
import { HealthController } from "./controllers/health.controller";
import { QueueController } from "./controllers/queue.controller";
import { OutboxEventEntity } from "./entities/outbox-event.entity";
import { QueueEntryEntity } from "./entities/queue-entry.entity";
import { QueueCacheService } from "./services/queue-cache.service";
import { QueueMessagingService } from "./services/queue-messaging.service";
import { QueueService } from "./services/queue.service";

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
      schema: "queue_service",
      autoLoadEntities: true,
      synchronize: true
    }),
    TypeOrmModule.forFeature([QueueEntryEntity, OutboxEventEntity])
  ],
  controllers: [HealthController, QueueController],
  providers: [QueueService, QueueCacheService, QueueMessagingService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}

