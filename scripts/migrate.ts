import "dotenv/config";
import { Client } from "pg";

const statements = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto;`,
  `CREATE SCHEMA IF NOT EXISTS user_service;`,
  `CREATE SCHEMA IF NOT EXISTS zone_management_service;`,
  `CREATE SCHEMA IF NOT EXISTS queue_service;`,
  `CREATE SCHEMA IF NOT EXISTS reservation_service;`,
  `CREATE SCHEMA IF NOT EXISTS notification_service;`,

  `CREATE TABLE IF NOT EXISTS user_service.roles (
      name VARCHAR(64) PRIMARY KEY,
      description VARCHAR(255) NOT NULL
    );`,
  `CREATE TABLE IF NOT EXISTS user_service.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role_name VARCHAR(64) NOT NULL REFERENCES user_service.roles(name),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,

  `CREATE TABLE IF NOT EXISTS zone_management_service.zones (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      type VARCHAR(64) NOT NULL,
      status VARCHAR(64) NOT NULL DEFAULT 'open',
      capacity INTEGER NOT NULL,
      current_occupancy INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
  `CREATE TABLE IF NOT EXISTS zone_management_service.zone_rules (
      zone_id UUID PRIMARY KEY REFERENCES zone_management_service.zones(id) ON DELETE CASCADE,
      queue_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      reservation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      overload_threshold_pct INTEGER NOT NULL DEFAULT 85,
      estimated_service_minutes_per_person INTEGER NOT NULL DEFAULT 3,
      reservation_slot_minutes INTEGER NOT NULL DEFAULT 60,
      reservation_window_days INTEGER NOT NULL DEFAULT 7,
      max_queue_size INTEGER NOT NULL DEFAULT 100,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
  `CREATE TABLE IF NOT EXISTS zone_management_service.outbox_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID UNIQUE NOT NULL,
      event_type VARCHAR(128) NOT NULL,
      entity_id VARCHAR(128) NOT NULL,
      correlation_id VARCHAR(128) NOT NULL,
      payload JSONB NOT NULL,
      published_at TIMESTAMPTZ NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
  `CREATE TABLE IF NOT EXISTS zone_management_service.processed_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID UNIQUE NOT NULL,
      event_type VARCHAR(128) NOT NULL,
      entity_id VARCHAR(128) NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,

  `CREATE TABLE IF NOT EXISTS queue_service.queue_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      zone_id UUID NOT NULL,
      user_id UUID NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      left_at TIMESTAMPTZ NULL
    );`,
  `CREATE TABLE IF NOT EXISTS queue_service.outbox_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID UNIQUE NOT NULL,
      event_type VARCHAR(128) NOT NULL,
      entity_id VARCHAR(128) NOT NULL,
      correlation_id VARCHAR(128) NOT NULL,
      payload JSONB NOT NULL,
      published_at TIMESTAMPTZ NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,

  `CREATE TABLE IF NOT EXISTS reservation_service.reservations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      zone_id UUID NOT NULL,
      user_id UUID NOT NULL,
      seat_number INTEGER NOT NULL,
      slot_start TIMESTAMPTZ NOT NULL,
      slot_end TIMESTAMPTZ NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cancelled_at TIMESTAMPTZ NULL
    );`,
  `CREATE TABLE IF NOT EXISTS reservation_service.outbox_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID UNIQUE NOT NULL,
      event_type VARCHAR(128) NOT NULL,
      entity_id VARCHAR(128) NOT NULL,
      correlation_id VARCHAR(128) NOT NULL,
      payload JSONB NOT NULL,
      published_at TIMESTAMPTZ NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,

  `CREATE TABLE IF NOT EXISTS notification_service.notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      event_id UUID NOT NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      zone_id UUID NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at TIMESTAMPTZ NULL
    );`,
  `CREATE TABLE IF NOT EXISTS notification_service.processed_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID UNIQUE NOT NULL,
      event_type VARCHAR(128) NOT NULL,
      entity_id VARCHAR(128) NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`
];

async function main(): Promise<void> {
  const client = new Client({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "qoms",
    password: process.env.POSTGRES_PASSWORD ?? "qoms",
    database: process.env.POSTGRES_DB ?? "qoms"
  });
  await client.connect();
  for (const statement of statements) {
    await client.query(statement);
  }
  await client.end();
  console.log("Migration bootstrap completed");
}

void main();

