import type { INestApplication } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { collectDefaultMetrics, Counter, Histogram, register } from "prom-client";

const requestCounter = new Counter({
  name: "qoms_http_requests_total",
  help: "Total HTTP requests handled by QOMS services.",
  labelNames: ["service", "method", "route", "status_code"] as const
});

const requestDuration = new Histogram({
  name: "qoms_http_request_duration_seconds",
  help: "HTTP request duration in seconds for QOMS services.",
  labelNames: ["service", "method", "route", "status_code"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

let defaultMetricsRegistered = false;

export function setupMetrics(app: INestApplication, serviceName: string): void {
  if (!defaultMetricsRegistered) {
    collectDefaultMetrics({
      prefix: "qoms_",
      labels: {
        service: serviceName
      }
    });
    defaultMetricsRegistered = true;
  }

  app.use((request: Request, response: Response, next: NextFunction) => {
    const endTimer = requestDuration.startTimer();
    response.on("finish", () => {
      const route = String(request.route?.path ?? request.path ?? request.url ?? "unknown");
      const labels = {
        service: serviceName,
        method: request.method,
        route,
        status_code: String(response.statusCode)
      };
      requestCounter.inc(labels);
      endTimer(labels);
    });
    next();
  });

  app.getHttpAdapter().get("/metrics", async (_request: Request, response: Response) => {
    response.setHeader("Content-Type", register.contentType);
    response.end(await register.metrics());
  });
}
