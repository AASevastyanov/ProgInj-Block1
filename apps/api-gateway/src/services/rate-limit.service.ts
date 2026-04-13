import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";
import type { RatePolicyName } from "../security/gateway-auth.decorators";

type TokenBucketPolicy = {
  kind: "token_bucket";
  capacity: number;
  refillPerSecond: number;
};

type SlidingWindowPolicy = {
  kind: "sliding_window";
  limit: number;
  windowSeconds: number;
};

type LeakyBucketPolicy = {
  kind: "leaky_bucket";
  capacity: number;
  leakPerSecond: number;
};

type RatePolicyConfig = TokenBucketPolicy | SlidingWindowPolicy | LeakyBucketPolicy;

const POLICIES: Record<RatePolicyName, RatePolicyConfig> = {
  default_read: { kind: "token_bucket", capacity: 30, refillPerSecond: 1 },
  default_write: { kind: "token_bucket", capacity: 15, refillPerSecond: 0.5 },
  login: { kind: "sliding_window", limit: 5, windowSeconds: 60 },
  join_queue: { kind: "sliding_window", limit: 5, windowSeconds: 30 },
  create_reservation: { kind: "sliding_window", limit: 5, windowSeconds: 30 },
  admin_write: { kind: "sliding_window", limit: 20, windowSeconds: 60 },
  occupancy_ingest: { kind: "leaky_bucket", capacity: 10, leakPerSecond: 0.5 }
};

@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
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

  async check(policyName: RatePolicyName, principal: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    const policy = POLICIES[policyName];
    switch (policy.kind) {
      case "token_bucket":
        return this.checkTokenBucket(policyName, principal, policy);
      case "sliding_window":
        return this.checkSlidingWindow(policyName, principal, policy);
      case "leaky_bucket":
        return this.checkLeakyBucket(policyName, principal, policy);
      default:
        return { allowed: true };
    }
  }

  private async checkTokenBucket(
    policyName: string,
    principal: string,
    policy: TokenBucketPolicy
  ): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    const key = `ratelimit:${policyName}:${principal}`;
    const current = await this.client.hgetall(key);
    const now = Date.now();
    const lastRefill = current.lastRefill ? Number(current.lastRefill) : now;
    const tokens = current.tokens ? Number(current.tokens) : policy.capacity;
    const refilledTokens = Math.min(policy.capacity, tokens + ((now - lastRefill) / 1000) * policy.refillPerSecond);

    if (refilledTokens < 1) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((1 - refilledTokens) / policy.refillPerSecond))
      };
    }

    await this.client.hset(key, {
      tokens: String(refilledTokens - 1),
      lastRefill: String(now)
    });
    await this.client.expire(key, Math.ceil(policy.capacity / policy.refillPerSecond));
    return { allowed: true };
  }

  private async checkSlidingWindow(
    policyName: string,
    principal: string,
    policy: SlidingWindowPolicy
  ): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    const key = `ratelimit:${policyName}:${principal}`;
    const now = Date.now();
    const windowStart = now - policy.windowSeconds * 1000;
    await this.client.zremrangebyscore(key, 0, windowStart);
    const currentCount = await this.client.zcard(key);
    if (currentCount >= policy.limit) {
      return {
        allowed: false,
        retryAfterSeconds: policy.windowSeconds
      };
    }
    await this.client.zadd(key, now, `${now}-${Math.random()}`);
    await this.client.expire(key, policy.windowSeconds);
    return { allowed: true };
  }

  private async checkLeakyBucket(
    policyName: string,
    principal: string,
    policy: LeakyBucketPolicy
  ): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    const key = `ratelimit:${policyName}:${principal}`;
    const current = await this.client.hgetall(key);
    const now = Date.now();
    const lastLeak = current.lastLeak ? Number(current.lastLeak) : now;
    const level = current.level ? Number(current.level) : 0;
    const leakedLevel = Math.max(0, level - ((now - lastLeak) / 1000) * policy.leakPerSecond);
    if (leakedLevel >= policy.capacity) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((leakedLevel - policy.capacity + 1) / policy.leakPerSecond))
      };
    }
    await this.client.hset(key, {
      level: String(leakedLevel + 1),
      lastLeak: String(now)
    });
    await this.client.expire(key, Math.ceil(policy.capacity / policy.leakPerSecond));
    return { allowed: true };
  }
}

