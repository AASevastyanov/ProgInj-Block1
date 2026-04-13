import "dotenv/config";
import { hash } from "bcryptjs";
import { Client } from "pg";

const USERS = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    email: "student@example.com",
    fullName: "Seed Student",
    roleName: "student"
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    email: "employee@example.com",
    fullName: "Seed Employee",
    roleName: "employee"
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    email: "dining_admin@example.com",
    fullName: "Dining Admin",
    roleName: "dining_admin"
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    email: "coworking_admin@example.com",
    fullName: "Coworking Admin",
    roleName: "coworking_admin"
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    email: "system_admin@example.com",
    fullName: "System Admin",
    roleName: "system_admin"
  }
] as const;

const ZONES = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "Main Dining Hall",
    type: "dining_zone",
    status: "open",
    capacity: 120,
    currentOccupancy: 48,
    rules: {
      queueEnabled: true,
      reservationEnabled: false,
      overloadThresholdPct: 85,
      estimatedServiceMinutesPerPerson: 3,
      reservationSlotMinutes: 60,
      reservationWindowDays: 7,
      maxQueueSize: 150
    }
  },
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    name: "North Coworking Space",
    type: "coworking_zone",
    status: "open",
    capacity: 40,
    currentOccupancy: 12,
    rules: {
      queueEnabled: false,
      reservationEnabled: true,
      overloadThresholdPct: 90,
      estimatedServiceMinutesPerPerson: 3,
      reservationSlotMinutes: 60,
      reservationWindowDays: 7,
      maxQueueSize: 40
    }
  }
] as const;

async function main(): Promise<void> {
  const client = new Client({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "qoms",
    password: process.env.POSTGRES_PASSWORD ?? "qoms",
    database: process.env.POSTGRES_DB ?? "qoms"
  });
  await client.connect();

  const roleDescriptions: Record<string, string> = {
    student: "Student",
    employee: "University employee",
    dining_admin: "Dining administrator",
    coworking_admin: "Coworking administrator",
    system_admin: "System administrator"
  };

  for (const [role, description] of Object.entries(roleDescriptions)) {
    await client.query(
      `INSERT INTO user_service.roles(name, description)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
      [role, description]
    );
  }

  const passwordHash = await hash("Password123!", 10);
  for (const user of USERS) {
    await client.query(
      `INSERT INTO user_service.users(id, email, full_name, password_hash, role_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           password_hash = EXCLUDED.password_hash,
           role_name = EXCLUDED.role_name,
           updated_at = NOW()`,
      [user.id, user.email, user.fullName, passwordHash, user.roleName]
    );
  }

  for (const zone of ZONES) {
    await client.query(
      `INSERT INTO zone_management_service.zones(id, name, type, status, capacity, current_occupancy)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           type = EXCLUDED.type,
           status = EXCLUDED.status,
           capacity = EXCLUDED.capacity,
           current_occupancy = EXCLUDED.current_occupancy,
           updated_at = NOW()`,
      [zone.id, zone.name, zone.type, zone.status, zone.capacity, zone.currentOccupancy]
    );

    await client.query(
      `INSERT INTO zone_management_service.zone_rules(
         zone_id,
         queue_enabled,
         reservation_enabled,
         overload_threshold_pct,
         estimated_service_minutes_per_person,
         reservation_slot_minutes,
         reservation_window_days,
         max_queue_size
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (zone_id) DO UPDATE
       SET queue_enabled = EXCLUDED.queue_enabled,
           reservation_enabled = EXCLUDED.reservation_enabled,
           overload_threshold_pct = EXCLUDED.overload_threshold_pct,
           estimated_service_minutes_per_person = EXCLUDED.estimated_service_minutes_per_person,
           reservation_slot_minutes = EXCLUDED.reservation_slot_minutes,
           reservation_window_days = EXCLUDED.reservation_window_days,
           max_queue_size = EXCLUDED.max_queue_size,
           updated_at = NOW()`,
      [
        zone.id,
        zone.rules.queueEnabled,
        zone.rules.reservationEnabled,
        zone.rules.overloadThresholdPct,
        zone.rules.estimatedServiceMinutesPerPerson,
        zone.rules.reservationSlotMinutes,
        zone.rules.reservationWindowDays,
        zone.rules.maxQueueSize
      ]
    );
  }

  await client.end();
  console.log("Seed data applied");
}

void main();

