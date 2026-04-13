import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { RequestIdMiddleware } from "@qoms/backend-common";
import { AuthController } from "./controllers/auth.controller";
import { GatewayHealthController } from "./controllers/health.controller";
import { MonitoringProxyController } from "./controllers/monitoring.controller";
import { NotificationsProxyController } from "./controllers/notifications.controller";
import { QueueProxyController } from "./controllers/queue.controller";
import { ReservationsProxyController } from "./controllers/reservations.controller";
import { UsersProxyController } from "./controllers/users.controller";
import { ZonesProxyController } from "./controllers/zones.controller";
import { GatewayAuthGuard } from "./security/gateway-auth.guard";
import { GatewayProxyService } from "./services/gateway-proxy.service";
import { RateLimitGuard } from "./services/rate-limit.guard";
import { RateLimitService } from "./services/rate-limit.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    })
  ],
  controllers: [
    GatewayHealthController,
    AuthController,
    UsersProxyController,
    ZonesProxyController,
    QueueProxyController,
    ReservationsProxyController,
    NotificationsProxyController,
    MonitoringProxyController
  ],
  providers: [GatewayProxyService, GatewayAuthGuard, RateLimitService, RateLimitGuard]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
