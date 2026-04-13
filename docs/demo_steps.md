# Demo Steps

## Подготовка

1. Запустить `docker compose up --build`.
2. Дождаться доступности `http://localhost:8080/api/health`.
3. Открыть два окна:
   - `http://localhost:8080/`
   - `http://localhost:8080/admin/`

## Сценарий 1. Очередь в столовую

1. В user-web войти под `student@example.com` / `Password123!`.
2. В списке зон найти `Main Dining Hall`.
3. Нажать `Join queue`.
4. Показать:
   - что у зоны есть статус и текущая загрузка;
   - что пользователь получил позицию в очереди;
   - что в блоке уведомлений появилось уведомление `Queue joined`.

## Сценарий 2. Бронирование места в коворкинге

1. В user-web найти `North Coworking Space`.
2. Указать `seatNumber`, например `1`.
3. Указать ближайший слот через datetime input.
4. Нажать `Create reservation`.
5. Показать:
   - запись в `My Reservations`;
   - уведомление `Reservation created`.

## Сценарий 3. Occupancy signal и перегрузка зоны

1. В admin-web войти под `system_admin@example.com` / `Password123!`.
2. В блоке `Send occupancy update` выбрать `Main Dining Hall`.
3. Установить occupancy выше порога перегрузки, например `110`.
4. Нажать `Publish occupancy signal`.
5. Показать:
   - обновленную загрузку зоны;
   - `Latest telemetry`;
   - `History` из ingestion service;
   - уведомления для admin users после `zone_overloaded`.

## Что сказать про архитектуру во время показа

- Пользовательские команды проходят синхронно через `API Gateway`.
- Доменные факты публикуются в Kafka через pragmatic outbox.
- `Redis / Valkey` используется для hot read-моделей и rate limiting.
- `MongoDB` хранит raw occupancy history и telemetry snapshots.
- Реализация intentionally проще production-системы, но сохраняет согласованный high-level контур.

