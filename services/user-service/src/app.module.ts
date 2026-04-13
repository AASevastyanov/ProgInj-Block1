import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RequestIdMiddleware } from "@qoms/backend-common";
import { AuthController } from "./controllers/auth.controller";
import { HealthController } from "./controllers/health.controller";
import { UsersController } from "./controllers/users.controller";
import { RoleEntity } from "./entities/role.entity";
import { UserEntity } from "./entities/user.entity";
import { UserService } from "./services/user.service";

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
      schema: "user_service",
      autoLoadEntities: true,
      synchronize: true
    }),
    TypeOrmModule.forFeature([UserEntity, RoleEntity])
  ],
  controllers: [HealthController, AuthController, UsersController],
  providers: [UserService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}

