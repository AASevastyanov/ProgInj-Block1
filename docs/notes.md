# Notes

## Спорные места, допущения и вопросы для ручной проверки

- Kafka архитектурно хорошо подходит системе, но для маленького MVP остается тяжеловатой. Если на защите акцент сместится на простоту, может потребоваться дополнительное устное обоснование, почему не выбран более легкий RabbitMQ или NATS.
- Kafka не дает глобального порядка по всем событиям системы. В текущем MVP предполагается локальный порядок в пределах partition, а message key по умолчанию привязан к `zoneId`.
- В runnable MVP для Kafka используется один topic с `eventType` внутри versioned event envelope. Это pragmatic simplification по сравнению с более строгим разбиением по topic-ам.
- Выбор Kafka требует дисциплины по partition key, schema evolution, retry и idempotency. Для учебного проекта это приемлемо, но усложняет эксплуатацию.
- `PostgreSQL` остается общей технической точкой риска даже при logical ownership boundaries и service-owned схемах.
- В проекте `PostgreSQL` хранит не только транзакционные данные, но и outbox, idempotency и часть журналов. Это практично для MVP, но при росте нагрузки такой контур станет более чувствительным.
- `Redis / Valkey` улучшает latency и разгружает `PostgreSQL`, но добавляет eventual consistency и риск stale data.
- Комбинация короткого TTL и инвалидирования по событиям уменьшает лаг, но не убирает риск cache stampede и неполной invalidation.
- `NoSQL / cold storage` в runnable MVP конкретизировано через `MongoDB`, а не через отдельный `S3-compatible object storage`. Это упрощение принято ради локального запуска и демонстрации проекта.
- Для `Monitoring / Event Ingestion Service` выбран `Mongo-first` durability flow: raw occupancy event сначала пишется в MongoDB, затем публикуется в Kafka с bounded retry и фоновым re-drive. Это осознанное отклонение от более строгой трактовки outbox для всех producer-сервисов.
- Retry в outbox-публикаторах и ingestion-потоке реализован упрощенно: есть ограничение по числу попыток и периодический polling, но нет полноценного per-message exponential backoff с jitter.
- `Monitoring / Event Ingestion Service` и `Observability Stack` нужно трактовать как разные элементы. Первый работает с бизнес-сигналами загрузки зон, второй относится к технической наблюдаемости.
- В проекте используется единая абстракция `managed zone / shared university space`. Это сознательное упрощение: столовая и коворкинг описываются общей управленческой моделью, хотя реальные правила для них могут различаться сильнее.
- Механики очереди и бронирования показаны как части общей системы, хотя для конкретной зоны одна из них может быть вторичной или вообще не использоваться.
- Механизм аутентификации не вынесен в отдельный `auth-service`. В MVP auth реализован внутри `user-service` и проверяется на входе в `API Gateway`.
- Routing layer намеренно оставлен простым: `nginx` на edge и `API Gateway` внутри прикладного контура. Это снижает риск overengineering, но оставляет за кадром WAF, mTLS, сложные ingress policies и bot protection.
- Лимиты задаются на двух уровнях: coarse-grained на edge и fine-grained на `API Gateway`. Точные численные значения в MVP подобраны демонстрационно и могут потребовать ручной корректировки перед показом.
- Реализация не включает полноценный DLQ-контур, Prometheus, Grafana и production-grade observability stack. Вместо этого используются structured logs, request ids, health endpoints и базовое логирование ошибок обработки событий.
- `Reservation Service` использует `seatNumber` в пределах `coworking_zone.capacity`, без отдельной сущности Seat. Это сознательное упрощение модели бронирования ради MVP.
- Кэш в queue и reservation flows инвалидируется практично, но не идеально глобально: часть производных read-моделей может жить до короткого TTL. Для MVP это допустимо, но для production-grade системы спорно.
- `Notification Service` в MVP создает mock notifications и при `zone_overloaded` рассылает их административным ролям без более тонкой фильтрации по типу зоны или зоне ответственности. Это упрощение стоит проговорить вручную.
