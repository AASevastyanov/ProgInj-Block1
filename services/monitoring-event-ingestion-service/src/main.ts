import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { setupMetrics } from "@qoms/backend-common";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );
  setupMetrics(app, "monitoring-event-ingestion-service");
  const port = Number(process.env.MONITORING_EVENT_INGESTION_SERVICE_PORT ?? 3006);
  await app.listen(port, "0.0.0.0");
  Logger.log(`monitoring-event-ingestion-service listening on ${port}`, "Bootstrap");
}

bootstrap();

