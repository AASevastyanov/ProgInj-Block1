# 07. Routing Layer

## Назначение routing layer

Для `QueueAndOccupancyManagementSystem` routing layer нужен, чтобы на входе в систему разделить:

- внешний сетевой вход;
- базовую маршрутизацию и балансировку;
- прикладную маршрутизацию API;
- аутентификацию и базовый контроль ролей;
- защиту от всплесков нагрузки.

В runnable MVP этот слой реализован через `nginx` на внешней границе и `API Gateway` внутри прикладного контура.

## Роли компонентов

### Edge Router / Load Balancer

`Edge Router / Load Balancer` расположен на внешней границе системы и в MVP реализован через `nginx`.

Его задачи:

- принять входящий HTTP-трафик;
- развести трафик между `user-web`, `admin-web` и `API Gateway`;
- применить coarse-grained ingress limits;
- скрыть внутренние адреса сервисов за единым входом.

В текущей конфигурации используются path-based маршруты:

- `/` -> `user-web`
- `/admin/` -> `admin-web`
- `/api/` -> `API Gateway`

### API Gateway

`API Gateway` расположен сразу за edge-слоем внутри прикладного контура.

Его задачи:

- проксировать вызовы к доменным сервисам;
- проверять JWT;
- применять базовые role-based ограничения;
- прокидывать `x-user-id`, `x-user-role` и `x-request-id` downstream-сервисам;
- применять основную fine-grained rate limiting политику;
- отдавать единый `/health` для входного API.

## Цепочка прохождения запроса

### Пользовательский и административный запрос

Базовая цепочка выглядит так:

`Client -> Edge Router / Load Balancer -> API Gateway -> target service`

После этого целевой сервис при необходимости делает синхронные межсервисные проверки, например:

- `Queue Service -> User Service`
- `Queue Service -> Zone Management Service`
- `Reservation Service -> User Service`
- `Reservation Service -> Zone Management Service`

### Внешний интеграционный поток

Для внешних сигналов загрузки используется цепочка:

`External Source -> Edge Router / Load Balancer -> API Gateway -> Monitoring / Event Ingestion Service`

В документации можно говорить и про dedicated integration route, но в MVP это остается частью общего входного контура через gateway, чтобы не раздувать инфраструктуру.

## Где применяются лимиты

Rate limiting применяется на двух уровнях.

### Coarse-grained limits на edge

На уровне `nginx` задаются базовые защитные лимиты для ingress:

- общий лимит на `/api/`;
- отдельный лимит на `POST /api/auth/login`;
- отдельный лимит на `join queue`;
- отдельный лимит на `POST /api/reservations`;
- отдельный лимит на `POST /api/occupancy-events`.

Этот уровень нужен, чтобы отсеивать грубые всплески трафика еще до входа в прикладной контур.

### Fine-grained limits на API Gateway

Основная политика лимитов сосредоточена в `API Gateway` и использует `Redis / Valkey`.

На gateway уже известны:

- маршрут;
- тип операции;
- principal пользователя или интеграционного вызова.

Поэтому именно здесь применяются разные политики для чтения, записи, логина, административных операций и ingestion-потока.

## Какие маршруты ограничиваются сильнее

Более строгие лимиты применяются для:

- `POST /auth/login`
- `POST /queues/:zoneId/join`
- `POST /queues/:zoneId/leave`
- `POST /reservations`
- `DELETE /reservations/:id`
- административных `POST` и `PATCH` маршрутов по зонам и правилам
- `POST /occupancy-events`

Чтение состояния зон, очереди, бронирований и уведомлений тоже ограничивается, но мягче, чем mutate-операции.

## Выбранная логика лимитов

В MVP используются три базовых алгоритма:

- token bucket для обычного пользовательского read/write API;
- sliding window для чувствительных маршрутов вроде логина, `join queue` и `create reservation`;
- leaky bucket для внешнего потока `occupancy-events`.

При превышении лимита gateway возвращает:

- `429 Too Many Requests`;
- `Retry-After`;
- логирование события превышения.

## Почему лимиты нужны именно в этой системе

Для этой системы характерны короткие пики интереса к одной `managed zone`:

- пользователи часто обновляют состояние зоны;
- пользователь может несколько раз нажать `join queue` или `create reservation` при задержке UI;
- административный интерфейс может отправить серию быстрых изменений;
- внешний поток occupancy-сигналов может приходить неравномерно.

Поэтому rate limiting поддерживает сразу несколько NFR:

- доступность;
- масштабируемость;
- управляемую деградацию;
- безопасность входного контура;
- защиту от всплесков нагрузки;
- наблюдаемость и трассировку.

## Разделение ответственности

| Элемент | Роль |
| --- | --- |
| `Edge Router / Load Balancer` | внешний вход, path-based routing, базовая балансировка и coarse-grained ingress limits |
| `API Gateway` | JWT validation, role checks, прикладная маршрутизация, request-id propagation и основная политика rate limiting |
| `Redis / Valkey` | хранение rate limit keys и других краткоживущих технических ключей |

## Компромисс для учебного проекта

Routing layer показан явно, но без лишней инфраструктурной детализации. В MVP сознательно не добавляются:

- отдельный WAF;
- mTLS между всеми компонентами;
- сложные ingress policies;
- vendor-specific ingress контроллеры;
- продвинутая bot protection.

Этого достаточно для runnable учебного проекта: видно, где находится edge, где gateway, где применяются лимиты и почему они нужны именно в данном доменном сценарии.
