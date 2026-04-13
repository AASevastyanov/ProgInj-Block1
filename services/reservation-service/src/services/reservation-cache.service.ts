import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class ReservationCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReservationCacheService.name);
  private client!: Redis;

  async onModuleInit(): Promise<void> {
    this.client = new Redis({
      host: process.env.REDIS_HOST ?? "localhost",
      port: Number(process.env.REDIS_PORT ?? 6379)
    });
    this.client.on("error", (error) => this.logger.error(error.message));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds = 10): Promise<void> {
    await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}
