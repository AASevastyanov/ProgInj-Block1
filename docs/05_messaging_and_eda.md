# 05. Messaging and Event-Driven Architecture

## Роль event-driven подхода

В `QueueAndOccupancyManagementSystem` event-driven подход дополняет синхронные REST-команды, а не заменяет их. Пользовательские и административные действия подтверждаются синхронно через `API Gateway` и целевой сервис, а Kafka используется для публикации уже подтвержденных доменных фактов и запуска вторичных реакций.

Для `managed zone / shared university space` это важно по двум причинам:

- часть операций требует немедленного и однозначного ответа пользователю;
- часть сигналов приходит извне и должна обрабатываться без блокировки основного API-потока.

## Синхронные и асинхронные взаимодействия

### Синхронные взаимодействия

Синхронно идут пользовательские команды и проверки прав или правил:

- `API Gateway -> User Service`
- `API Gateway -> Zone Management Service`
- `API Gateway -> Queue Service`
- `API Gateway -> Reservation Service`
- `API Gateway -> Notification Service`
- `API Gateway -> Monitoring / Event Ingestion Service`
- `Queue Service -> User Service`
- `Queue Service -> Zone Management Service`
- `Reservation Service -> User Service`
- `Reservation Service -> Zone Management Service`

Такой путь используется для чтения состояния зоны, получения статуса очереди, просмотра доступности мест, вступления в очередь, выхода из очереди, создания и отмены бронирования, а также для административных операций.

### Асинхронные взаимодействия

Асинхронно идут внешние сигналы загрузки, публикация доменных фактов, уведомления и вторичные реакции:

- `Monitoring / Event Ingestion Service -> Kafka`
- `Zone Management Service -> Kafka`
- `Queue Service -> Kafka`
- `Reservation Service -> Kafka`
- `Zone Management Service <- Kafka`
- `Notification Service <- Kafka`

В текущем MVP это реализовано через один Kafka topic `queue-and-occupancy-events` и versioned event envelope с полем `eventType`. Это сознательное упрощение локальной версии, а не универсальная рекомендация для production.

## Kafka events

Используются только согласованные события:

- `occupancy_updated`
- `zone_status_changed`
- `zone_overloaded`
- `queue_joined`
- `queue_left`
- `queue_status_changed`
- `reservation_created`
- `reservation_cancelled`

## Producer и Consumer

### Producer

Producer в текущей архитектуре:

- `Monitoring / Event Ingestion Service`
- `Zone Management Service`
- `Queue Service`
- `Reservation Service`

`Monitoring / Event Ingestion Service` публикует `occupancy_updated`. Остальные producer-сервисы публикуют доменные факты после подтвержденной записи в свои транзакционные хранилища.

### Consumer

Consumer в текущей архитектуре:

- `Zone Management Service`
- `Notification Service`

`Zone Management Service` потребляет `occupancy_updated` и на этой основе пересчитывает агрегированное состояние зоны. `Notification Service` потребляет доменные события и создает пользовательские или административные уведомления.

## Почему выбрана Kafka

Kafka выбрана потому, что для проекта важен не просто транспорт сообщений, а replayable event log:

- с повторным чтением событий;
- с несколькими независимыми consumer group;
- с возможностью расширять асинхронный контур без изменения основного пользовательского потока;
- с локальным порядком сообщений внутри partition по ключу сущности.

В реализованном MVP message key по умолчанию привязан к `zoneId`. Это упрощает ordering для связанных событий зоны, очереди и загрузки. Для бронирований это тоже рабочий компромисс, хотя более детальная модель могла бы потребовать иного partition key.

Важно не скрывать ограничение: Kafka не дает глобального порядка по всем событиям системы сразу. Порядок гарантируется только в пределах partition и выбранного ключа.

## Kafka vs RabbitMQ vs NATS

### Критерии сравнения

Для этого проекта важны:

- replay и retention;
- несколько независимых consumer group;
- возможность повторного чтения истории событий;
- пригодность того же потока для audit и analytics;
- умеренная сложность для учебного high-level решения.

### Сравнение

| Критерий | Kafka | RabbitMQ | NATS |
| --- | --- | --- | --- |
| Базовая модель | event log и поток событий | очереди и маршрутизация сообщений | легкий messaging, pub/sub, request/reply |
| Replay и retention | сильная сторона | не основной сценарий | сопоставимый сценарий требует JetStream |
| Независимые consumer group | естественный сценарий | возможны, но не центральны | возможны, но теряется часть простоты |
| История событий как архитектурный актив | подходит хорошо | подходит ограниченно | без JetStream подходит хуже |
| Простота маленького MVP | ниже | выше | выше |
| Расширение на audit и analytics | высокое | среднее | среднее |

### Когда RabbitMQ был бы лучше

RabbitMQ выглядел бы практичнее, если бы приоритетом были:

- task queue;
- fanout-уведомления;
- гибкая маршрутизация сообщений;
- более простая интеграция;
- отсутствие требования хранить и перечитывать историю событий как важный актив системы.

Для `QueueAndOccupancyManagementSystem` этого недостаточно, потому что здесь важен повторно читаемый поток доменных событий, а не только доставка текущего сообщения.

### Когда NATS был бы лучше

NATS выглядел бы практичнее, если бы приоритетом были:

- легкий межсервисный транспорт;
- request/reply;
- низкая латентность;
- низкая операционная сложность.

Для нашего кейса это возможно только при использовании JetStream, но тогда теряется часть простоты, а модель все равно оказывается менее естественной для учебного описания replayable event log.

## Надежность событийного взаимодействия

### Retry

Retry нужен только для временных ошибок. В runnable MVP используется bounded retry с ограничением по числу попыток, периодическим polling publisher и отдельным логированием ошибки. Полноценный per-message backoff с jitter здесь намеренно не усложняется.

### Idempotency

Идемпотентность обязательна для consumer:

- по `eventId`;
- по бизнес-ключам, например `queueEntryId`, `reservationId`, `sourceEventId`;
- через таблицы `processed_events` или уникальные ограничения там, где это практично.

Это особенно важно для `Zone Management Service` и `Notification Service`, чтобы повторная доставка не меняла состояние повторно и не создавала дубликаты уведомлений.

### Обработка ошибок и DLQ

В документации высокий уровень предполагает DLQ и manual re-drive, но в runnable MVP тяжелая DLQ-инфраструктура не поднимается. Вместо этого остаются:

- bounded retry;
- хранение причины ошибки;
- сохранение failed state для повторной попытки;
- structured logs для ручного разбора.

Это компромисс в пользу простоты локального запуска.

### Outbox и dual write

Для `Queue Service`, `Reservation Service` и `Zone Management Service` реализован pragmatic transactional outbox в `PostgreSQL`. Сервис сначала фиксирует бизнес-изменение и outbox-запись в одной транзакции, а затем фоновый publisher отправляет событие в Kafka.

Для `Monitoring / Event Ingestion Service` используется другой прагматичный путь: raw occupancy event сначала сохраняется в `MongoDB`, затем публикуется в Kafka, а статус публикации и retry metadata остаются в Mongo-документе. Это `Mongo-first` отклонение зафиксировано отдельно как упрощение MVP.

### Schema evolution

События обернуты в versioned event envelope:

- `eventId`
- `eventType`
- `version`
- `occurredAt`
- `sourceService`
- `correlationId`
- `entityId`
- `payload`

Для учебного MVP этого достаточно, чтобы показать backward-compatible evolution без введения отдельной тяжелой schema registry инфраструктуры.

## Компромиссы выбора Kafka

Kafka архитектурно хорошо подходит системе, но у такого выбора есть цена:

- для маленького MVP Kafka тяжеловата;
- она усложняет локальную эксплуатацию;
- она требует дисциплины по partition key;
- она требует аккуратной работы со схемами событий;
- она требует понятной observability вокруг producer и consumer.

Поэтому в проекте важно прямо проговаривать: Kafka выбрана потому, что логически подходит требованиям replay и расширяемости, а не потому, что это всегда лучший брокер для любого учебного решения.

## Практический вывод

Kafka выбрана как наиболее подходящий брокер для этой системы, потому что здесь важны:

- replayable event log;
- повторное чтение событий;
- несколько независимых consumer group;
- локальный порядок по ключу сущности;
- возможность наращивать audit и analytics без перестройки основного потока.

Если бы проект был меньше и не требовал относиться к истории событий как к полезному архитектурному активу, RabbitMQ или NATS могли бы оказаться проще. В текущем MVP это признанный компромисс, а не скрытая сложность.
