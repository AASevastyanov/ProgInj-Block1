# QueueAndOccupancyManagementSystem

Runnable MVP монорепозитория для системы мониторинга очередей и управления загрузкой университетской столовой и коворкинга. Реализация опирается на уже согласованную документацию и сохраняет исходную архитектурную идею: синхронные REST-команды через `API Gateway`, асинхронные доменные события через Kafka, `PostgreSQL` как транзакционный слой, `Redis / Valkey` как hot data и rate limiting, `MongoDB` как concrete `NoSQL / cold storage` для occupancy history и telemetry.

## Состав monorepo

- `apps/api-gateway` - единая входная точка, JWT auth, role checks, Redis-backed rate limiting.
- `apps/user-web` - пользовательский интерфейс для зон, очереди, бронирований и уведомлений.
- `apps/admin-web` - административный интерфейс для зон, правил и occupancy demo.
- `services/user-service` - пользователи, роли, login/register, JWT issue.
- `services/zone-management-service` - managed zones, rules, status, occupancy handling, zone events.
- `services/queue-service` - очередь для `dining_zone`.
- `services/reservation-service` - бронирования для `coworking_zone`.
- `services/notification-service` - Kafka consumer и история уведомлений.
- `services/monitoring-event-ingestion-service` - intake внешних occupancy signals, Mongo history, telemetry snapshots.
- `packages/shared` - общие доменные константы, роли, типы зон, Kafka events, event envelope.
- `packages/backend-common` - request ids, header-based user context, service guards, health helpers.
- `tests/smoke` - smoke-сценарии для ключевых end-to-end путей.

## Технологии

- Node.js 20+
- TypeScript
- pnpm workspaces
- NestJS
- React + Vite
- PostgreSQL
- Redis / Valkey
- MongoDB
- Kafka
- nginx
- Docker Compose

## Запуск

### 1. Подготовить env

```bash
cp .env.example .env
```

На Windows можно просто создать `.env` рядом с `.env.example` и скопировать значения.

### 2. Поднять окружение

```bash
docker compose up --build
```

После первого старта compose поднимет:

- `postgres`
- `redis`
- `mongo`
- `kafka`
- все backend services
- `api-gateway`
- `user-web`
- `admin-web`
- `nginx`
- `bootstrap` для `migrate + seed`

### 3. Открыть приложение

- пользовательский UI: [http://localhost:8080/](http://localhost:8080/)
- административный UI: [http://localhost:8080/admin/](http://localhost:8080/admin/)
- gateway health: [http://localhost:8080/api/health](http://localhost:8080/api/health)

## Seed users

Пароль для всех seeded пользователей:

```text
Password123!
```

Пользователи:

- `student@example.com`
- `employee@example.com`
- `dining_admin@example.com`
- `coworking_admin@example.com`
- `system_admin@example.com`

## Seed zones

- `Main Dining Hall` - `dining_zone`
- `North Coworking Space` - `coworking_zone`

## Основные API

### User service

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/users/:id`
- `GET /api/users`
- `PATCH /api/users/:id/role`

### Zone management

- `GET /api/zones`
- `GET /api/zones/:id`
- `POST /api/zones`
- `PATCH /api/zones/:id`
- `GET /api/zones/:id/status`
- `GET /api/zones/:id/rules`
- `PATCH /api/zones/:id/rules`

### Queue

- `POST /api/queues/:zoneId/join`
- `POST /api/queues/:zoneId/leave`
- `GET /api/queues/:zoneId/me`
- `GET /api/queues/:zoneId/state`

### Reservation

- `POST /api/reservations`
- `DELETE /api/reservations/:id`
- `GET /api/reservations/me`
- `GET /api/reservations/zone/:zoneId`

### Notifications

- `GET /api/notifications/me`
- `PATCH /api/notifications/:id/read`

### Monitoring intake

- `POST /api/occupancy-events`
- `GET /api/occupancy-events/:zoneId/history`
- `GET /api/telemetry/:zoneId/latest`

## Demo flow 
Кратко туда-сюда:

1. Войти как `student@example.com` в user-web, открыть dining zone, вступить в очередь, показать позицию и уведомление.
2. В user-web открыть coworking zone, создать бронирование, показать запись и уведомление.
3. Войти как `system_admin@example.com` в admin-web, отправить occupancy signal, показать обновленную загрузку, telemetry history и событие перегрузки.

## Smoke tests

После старта окружения можно выполнить:

```bash
pnpm smoke
```

Если хостовый `pnpm install` недоступен, smoke suite можно запустить внутри `api-gateway` container:

```bash
docker exec qoms-api-gateway-1 sh -lc "cd /app && SMOKE_BASE_URL=http://127.0.0.1:3000 pnpm smoke"
```

Smoke suite проверяет:

- login seeded student
- join dining queue
- reservation create
- notification creation
- occupancy ingest
- telemetry endpoint
