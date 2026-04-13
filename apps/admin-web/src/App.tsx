import { FormEvent, useEffect, useMemo, useState } from "react";

type ZoneType = "dining_zone" | "coworking_zone";
type ZoneStatus = "open" | "closed" | "overloaded";

type ZoneRules = {
  queueEnabled: boolean;
  reservationEnabled: boolean;
  overloadThresholdPct: number;
  estimatedServiceMinutesPerPerson: number;
  reservationSlotMinutes: number;
  reservationWindowDays: number;
  maxQueueSize: number;
};

type Zone = {
  id: string;
  name: string;
  type: ZoneType;
  status: ZoneStatus | string;
  capacity: number;
  currentOccupancy: number;
  occupancyPct?: number;
  rules: ZoneRules;
};

type Notification = {
  id: string;
  title: string;
  body: string;
  zoneId?: string | null;
  readAt: string | null;
  createdAt: string;
};

type TelemetrySnapshot = {
  zoneId: string;
  occupancy: number;
  source: string;
  observedAt: string;
  updatedAt: string;
};

type HistoryItem = {
  eventId: string;
  correlationId: string;
  zoneId: string;
  occupancy: number;
  source: string;
  observedAt: string;
  publishStatus: string;
  retryCount: number;
  lastError?: string | null;
  createdAt: string;
};

type Notice = {
  tone: "success" | "error" | "info";
  message: string;
};

const TOKEN_KEY = "qoms-admin-token";
const REFRESH_INTERVAL_MS = 15000;

const statusLabels: Record<string, string> = {
  open: "Открыта",
  closed: "Закрыта",
  overloaded: "Перегружена"
};

const zoneTypeLabels: Record<ZoneType, string> = {
  dining_zone: "Столовая",
  coworking_zone: "Коворкинг"
};

const notificationTitleLabels: Record<string, string> = {
  "queue joined": "Студент встал в очередь",
  "queue left": "Студент покинул очередь",
  "reservation created": "Бронирование создано",
  "reservation cancelled": "Бронирование отменено",
  "zone overloaded": "Зона перегружена"
};

const publishStatusLabels: Record<string, string> = {
  published: "Опубликовано в Kafka",
  pending: "Ожидает публикации",
  failed: "Ошибка публикации"
};

const sourceLabels: Record<string, string> = {
  admin_web: "Админ-панель",
  sensor: "Сенсор",
  camera_counter: "Камера / счетчик"
};

const errorTranslations: Record<string, string> = {
  "Missing user context": "Пользователь не определен. Войдите снова.",
  "Zone is closed": "Зона сейчас закрыта.",
  "Zone not found": "Зона не найдена.",
  "Zone rules not found": "Правила зоны не найдены."
};

const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short"
});

async function api<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {})
    }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message ?? `HTTP ${response.status}`);
  }
  if (response.status === 204) {
    return null as T;
  }
  return response.json() as Promise<T>;
}

function formatDateTime(value?: string | Date | null): string {
  if (!value) {
    return "—";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return dateTimeFormatter.format(date);
}

function formatStatus(status: string): string {
  return statusLabels[status] ?? status;
}

function formatZoneType(type: ZoneType): string {
  return zoneTypeLabels[type];
}

function formatSource(source: string): string {
  return sourceLabels[source] ?? source;
}

function formatPublishStatus(status: string): string {
  return publishStatusLabels[status] ?? status;
}

function getStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "open") {
    return "success";
  }
  if (status === "overloaded") {
    return "danger";
  }
  if (status === "closed") {
    return "neutral";
  }
  return "warning";
}

function getPublishTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "published") {
    return "success";
  }
  if (status === "failed") {
    return "danger";
  }
  if (status === "pending") {
    return "warning";
  }
  return "neutral";
}

function translateErrorMessage(message: string): string {
  return errorTranslations[message] ?? message;
}

function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function replaceKnownZoneIds(text: string, zoneNameById: Record<string, string>): string {
  return Object.entries(zoneNameById).reduce(
    (result, [zoneId, zoneName]) => result.split(zoneId).join(`«${zoneName}»`),
    text
  );
}

function formatNotification(notification: Notification, zoneNameById: Record<string, string>) {
  const normalizedTitle = notification.title.toLowerCase();
  const translatedTitle = notificationTitleLabels[normalizedTitle] ?? notification.title;
  const zoneName = notification.zoneId ? zoneNameById[notification.zoneId] : undefined;
  const occupancyMatch = /occupancy (\d+)/i.exec(notification.body);

  if (normalizedTitle === "zone overloaded") {
    return {
      title: translatedTitle,
      body: zoneName
        ? `После сигнала загрузки зона «${zoneName}» перешла в перегрузку${occupancyMatch ? `: текущее значение ${occupancyMatch[1]}.` : "."}`
        : replaceKnownZoneIds(notification.body, zoneNameById)
    };
  }

  return {
    title: translatedTitle,
    body: replaceKnownZoneIds(notification.body, zoneNameById)
  };
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [email, setEmail] = useState("system_admin@example.com");
  const [password, setPassword] = useState("Password123!");
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const [zoneForm, setZoneForm] = useState({
    name: "Новая зона",
    type: "dining_zone" as ZoneType,
    capacity: "80",
    queueEnabled: true,
    reservationEnabled: false,
    overloadThresholdPct: "85",
    estimatedServiceMinutesPerPerson: "3",
    reservationSlotMinutes: "60",
    reservationWindowDays: "7",
    maxQueueSize: "100"
  });
  const [occupancyForm, setOccupancyForm] = useState({
    zoneId: "",
    occupancy: "50",
    source: "admin_web",
    observedAt: toDateTimeLocalValue(new Date())
  });

  const selectedZone = useMemo(() => zones.find((zone) => zone.id === selectedZoneId), [zones, selectedZoneId]);
  const zoneNameById = useMemo(
    () => Object.fromEntries(zones.map((zone) => [zone.id, zone.name])),
    [zones]
  );
  const occupancyTargetZone = useMemo(
    () => zones.find((zone) => zone.id === occupancyForm.zoneId) ?? selectedZone ?? null,
    [occupancyForm.zoneId, selectedZone, zones]
  );
  const occupancyValue = Number(occupancyForm.occupancy);
  const predictedOccupancyPct =
    occupancyTargetZone && occupancyTargetZone.capacity > 0 && Number.isFinite(occupancyValue)
      ? Math.round((occupancyValue / occupancyTargetZone.capacity) * 100)
      : 0;
  const willBeOverloaded =
    !!occupancyTargetZone &&
    Number.isFinite(occupancyValue) &&
    predictedOccupancyPct >= occupancyTargetZone.rules.overloadThresholdPct;

  useEffect(() => {
    if (token) {
      void loadZones(token);
    }
  }, [token]);

  useEffect(() => {
    if (token && selectedZoneId) {
      void loadZoneInsights(selectedZoneId, token);
    }
  }, [token, selectedZoneId]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadZones(token, { showSpinner: false, showErrorNotice: false });
      if (selectedZoneId) {
        void loadZoneInsights(selectedZoneId, token, { showErrorNotice: false });
      }
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [token, selectedZoneId]);

  async function loadZones(
    activeToken = token,
    options: { showSpinner?: boolean; showErrorNotice?: boolean } = {}
  ) {
    if (!activeToken) return;
    const { showSpinner = true, showErrorNotice = true } = options;
    if (showSpinner) {
      setIsRefreshing(true);
    }
    try {
      const [zoneList, notificationItems] = await Promise.all([
        api<Zone[]>("/zones", {}, activeToken),
        api<Notification[]>("/notifications/me", {}, activeToken)
      ]);
      setZones(zoneList);
      setNotifications(notificationItems);
      const firstZoneId = zoneList[0]?.id ?? "";
      setSelectedZoneId((current) => (current && zoneList.some((zone) => zone.id === current) ? current : firstZoneId));
      setOccupancyForm((current) => ({
        ...current,
        zoneId: current.zoneId && zoneList.some((zone) => zone.id === current.zoneId) ? current.zoneId : firstZoneId
      }));
      setLastUpdatedAt(new Date().toISOString());
    } catch (err) {
      if (showErrorNotice) {
        setNotice({
          tone: "error",
          message: translateErrorMessage((err as Error).message)
        });
      }
    } finally {
      if (showSpinner) {
        setIsRefreshing(false);
      }
    }
  }

  async function loadZoneInsights(
    zoneId: string,
    activeToken = token,
    options: { showErrorNotice?: boolean } = {}
  ) {
    if (!activeToken || !zoneId) return;
    const { showErrorNotice = true } = options;
    try {
      const [latest, historyItems] = await Promise.all([
        api<TelemetrySnapshot | null>(`/telemetry/${zoneId}/latest`, {}, activeToken),
        api<HistoryItem[]>(`/occupancy-events/${zoneId}/history`, {}, activeToken)
      ]);
      setLatestTelemetry(latest);
      setHistory(historyItems);
    } catch (err) {
      if (showErrorNotice) {
        setNotice({
          tone: "error",
          message: translateErrorMessage((err as Error).message)
        });
      }
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    try {
      const result = await api<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setNotice({
        tone: "success",
        message: "Вход выполнен. Данные админки загружаются."
      });
    } catch (err) {
      setNotice({
        tone: "error",
        message: translateErrorMessage((err as Error).message)
      });
    }
  }

  async function withAction(actionKey: string, action: () => Promise<void>, successMessage: string) {
    setPendingActionKey(actionKey);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: "success", message: successMessage });
    } catch (err) {
      setNotice({
        tone: "error",
        message: translateErrorMessage((err as Error).message)
      });
    } finally {
      setPendingActionKey(null);
    }
  }

  async function createZone() {
    if (!token) return;
    await withAction(
      "create-zone",
      async () => {
        await api(
          "/zones",
          {
            method: "POST",
            body: JSON.stringify({
              name: zoneForm.name,
              type: zoneForm.type,
              capacity: Number(zoneForm.capacity),
              rules: {
                queueEnabled: zoneForm.queueEnabled,
                reservationEnabled: zoneForm.reservationEnabled,
                overloadThresholdPct: Number(zoneForm.overloadThresholdPct),
                estimatedServiceMinutesPerPerson: Number(zoneForm.estimatedServiceMinutesPerPerson),
                reservationSlotMinutes: Number(zoneForm.reservationSlotMinutes),
                reservationWindowDays: Number(zoneForm.reservationWindowDays),
                maxQueueSize: Number(zoneForm.maxQueueSize)
              }
            })
          },
          token
        );
        await loadZones(token, { showSpinner: false });
      },
      `Зона «${zoneForm.name}» создана.`
    );
  }

  async function updateSelectedZone() {
    if (!token || !selectedZone) return;
    await withAction(
      "update-zone",
      async () => {
        await api(
          `/zones/${selectedZone.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: selectedZone.name,
              capacity: selectedZone.capacity,
              status: selectedZone.status
            })
          },
          token
        );
        await api(
          `/zones/${selectedZone.id}/rules`,
          {
            method: "PATCH",
            body: JSON.stringify(selectedZone.rules)
          },
          token
        );
        await loadZones(token, { showSpinner: false });
        await loadZoneInsights(selectedZone.id, token, { showErrorNotice: false });
      },
      `Настройки зоны «${selectedZone.name}» сохранены.`
    );
  }

  async function sendOccupancyUpdate() {
    if (!token || !occupancyForm.zoneId) return;
    const zoneName = zoneNameById[occupancyForm.zoneId] ?? "выбранной зоны";
    await withAction(
      "occupancy",
      async () => {
        await api(
          "/occupancy-events",
          {
            method: "POST",
            body: JSON.stringify({
              zoneId: occupancyForm.zoneId,
              occupancy: Number(occupancyForm.occupancy),
              source: occupancyForm.source,
              observedAt: occupancyForm.observedAt ? new Date(occupancyForm.observedAt).toISOString() : undefined
            })
          },
          token
        );
        await loadZones(token, { showSpinner: false });
        await loadZoneInsights(occupancyForm.zoneId, token, { showErrorNotice: false });
      },
      willBeOverloaded
        ? `Сигнал загрузки для зоны «${zoneName}» отправлен. Ожидается статус «Перегружена» и уведомление администратору.`
        : `Сигнал загрузки для зоны «${zoneName}» отправлен. Загрузка и telemetry обновлены.`
    );
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setZones([]);
    setSelectedZoneId("");
    setLatestTelemetry(null);
    setHistory([]);
    setNotifications([]);
    setNotice(null);
    setLastUpdatedAt("");
  }

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="card auth-card">
          <span className="eyebrow">Демо для администратора</span>
          <h1>Панель мониторинга зон</h1>
          <p className="muted">
            Администратор видит статус зон, правила работы столовой и коворкинга, текущие данные telemetry и может
            отправить сигнал загрузки для демонстрации перегрузки.
          </p>
          <div className="info-banner">
            <strong>Тестовый вход:</strong> system_admin@example.com / Password123!
          </div>
          {notice ? <div className={`notice ${notice.tone}`}>{notice.message}</div> : null}
          <form onSubmit={login}>
            <label className="field-label" htmlFor="admin-email">
              Электронная почта
            </label>
            <input
              id="admin-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="system_admin@example.com"
            />
            <label className="field-label" htmlFor="admin-password">
              Пароль
            </label>
            <input
              id="admin-password"
              value={password}
              type="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password123!"
            />
            <button type="submit">Войти</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="card hero">
        <div className="hero-top">
          <div>
            <span className="eyebrow">Административная панель</span>
            <h1>Мониторинг зон и демонстрация occupancy signals</h1>
            <p className="muted">
              Админка показывает список зон, их статус и правила, последний telemetry snapshot, историю входящих
              сигналов загрузки и уведомления, которые появляются при перегрузке зоны.
            </p>
          </div>
          <div className="hero-actions">
            <button className="secondary" onClick={() => void loadZones()}>
              {isRefreshing ? "Обновление..." : "Обновить данные"}
            </button>
            <button onClick={logout}>Выйти</button>
          </div>
        </div>

        <div className="hero-grid">
          <div className="info-block">
            <h2>Что демонстрирует админка</h2>
            <p>Изменение загрузки зоны, смену статуса на «Перегружена», сохранение telemetry в MongoDB и уведомление для администратора.</p>
          </div>
          <div className="info-block">
            <h2>Что такое сигнал загрузки</h2>
            <p>Это внешнее сообщение о том, сколько людей сейчас находится в зоне. После отправки данные попадают в history и latest telemetry.</p>
          </div>
          <div className="info-block">
            <h2>Что должно произойти после отправки</h2>
            <p>Обновится текущая загрузка зоны. Если значение превысит порог перегрузки, статус станет «Перегружена» и появится новое уведомление.</p>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Всего зон</span>
            <strong>{zones.length}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Выбрана зона</span>
            <strong>{selectedZone?.name ?? "—"}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Новых уведомлений</span>
            <strong>{notifications.filter((notification) => !notification.readAt).length}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Последнее обновление</span>
            <strong>{lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "—"}</strong>
          </div>
        </div>

        {notice ? <div className={`notice ${notice.tone}`}>{notice.message}</div> : null}
      </section>

      <section className="grid">
        <article className="card">
          <div className="section-header">
            <div>
              <h2>Список зон</h2>
              <p className="muted">Выберите зону, чтобы посмотреть правила, telemetry и историю сигналов.</p>
            </div>
          </div>

          <div className="stack">
            {zones.map((zone) => (
              <button
                key={zone.id}
                type="button"
                className={`zone-button ${selectedZoneId === zone.id ? "selected" : ""}`}
                onClick={() => {
                  setSelectedZoneId(zone.id);
                  setOccupancyForm((current) => ({ ...current, zoneId: zone.id }));
                }}
              >
                <div className="card-title-row">
                  <strong>{zone.name}</strong>
                  <span className={`badge ${getStatusTone(zone.status)}`}>{formatStatus(zone.status)}</span>
                </div>
                <p className="muted">
                  {formatZoneType(zone.type)} • {zone.currentOccupancy} из {zone.capacity} • {zone.occupancyPct ?? 0}%
                </p>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.min(zone.occupancyPct ?? 0, 100)}%` }} />
                </div>
              </button>
            ))}
          </div>
        </article>

        <article className="card">
          <div className="section-header">
            <div>
              <h2>Выбранная зона</h2>
              <p className="muted">Здесь показаны текущая загрузка, статус и правила работы выбранной зоны.</p>
            </div>
          </div>

          {!selectedZone ? (
            <p className="empty-text">Выберите зону слева.</p>
          ) : (
            <div className="stack">
              <div className="card-title-row">
                <h3>{selectedZone.name}</h3>
                <span className={`badge ${getStatusTone(selectedZone.status)}`}>{formatStatus(selectedZone.status)}</span>
              </div>

              <div className="metrics-grid">
                <div className="metric">
                  <span className="metric-label">Тип</span>
                  <strong>{formatZoneType(selectedZone.type)}</strong>
                </div>
                <div className="metric">
                  <span className="metric-label">Текущая загрузка</span>
                  <strong>
                    {selectedZone.currentOccupancy} из {selectedZone.capacity}
                  </strong>
                </div>
                <div className="metric">
                  <span className="metric-label">Порог перегрузки</span>
                  <strong>{selectedZone.rules.overloadThresholdPct}%</strong>
                </div>
                <div className="metric">
                  <span className="metric-label">Очередь</span>
                  <strong>{selectedZone.rules.queueEnabled ? "Включена" : "Выключена"}</strong>
                </div>
                <div className="metric">
                  <span className="metric-label">Бронирование</span>
                  <strong>{selectedZone.rules.reservationEnabled ? "Включено" : "Выключено"}</strong>
                </div>
                <div className="metric">
                  <span className="metric-label">Максимум очереди</span>
                  <strong>{selectedZone.rules.maxQueueSize}</strong>
                </div>
              </div>

              <div className="rule-list">
                <div className="rule-item">
                  <span>Скорость обслуживания в столовой</span>
                  <strong>{selectedZone.rules.estimatedServiceMinutesPerPerson} мин на человека</strong>
                </div>
                <div className="rule-item">
                  <span>Длительность слота в коворкинге</span>
                  <strong>{selectedZone.rules.reservationSlotMinutes} мин</strong>
                </div>
                <div className="rule-item">
                  <span>Окно бронирования</span>
                  <strong>{selectedZone.rules.reservationWindowDays} дней</strong>
                </div>
              </div>

              <details className="details-card">
                <summary>Редактирование зоны</summary>
                <label className="field-label" htmlFor="selected-zone-name">
                  Название зоны
                </label>
                <input
                  id="selected-zone-name"
                  value={selectedZone.name}
                  onChange={(event) =>
                    setZones((current) =>
                      current.map((zone) => (zone.id === selectedZone.id ? { ...zone, name: event.target.value } : zone))
                    )
                  }
                />
                <label className="field-label" htmlFor="selected-zone-capacity">
                  Вместимость
                </label>
                <input
                  id="selected-zone-capacity"
                  value={selectedZone.capacity}
                  onChange={(event) =>
                    setZones((current) =>
                      current.map((zone) =>
                        zone.id === selectedZone.id ? { ...zone, capacity: Number(event.target.value) } : zone
                      )
                    )
                  }
                />
                <label className="field-label" htmlFor="selected-zone-status">
                  Статус
                </label>
                <select
                  id="selected-zone-status"
                  value={selectedZone.status}
                  onChange={(event) =>
                    setZones((current) =>
                      current.map((zone) => (zone.id === selectedZone.id ? { ...zone, status: event.target.value } : zone))
                    )
                  }
                >
                  <option value="open">Открыта</option>
                  <option value="closed">Закрыта</option>
                  <option value="overloaded">Перегружена</option>
                </select>
                <label className="field-label" htmlFor="selected-zone-threshold">
                  Порог перегрузки, %
                </label>
                <input
                  id="selected-zone-threshold"
                  value={selectedZone.rules.overloadThresholdPct}
                  onChange={(event) =>
                    setZones((current) =>
                      current.map((zone) =>
                        zone.id === selectedZone.id
                          ? { ...zone, rules: { ...zone.rules, overloadThresholdPct: Number(event.target.value) } }
                          : zone
                      )
                    )
                  }
                />
                <label className="field-label" htmlFor="selected-zone-queue-max">
                  Максимальная очередь
                </label>
                <input
                  id="selected-zone-queue-max"
                  value={selectedZone.rules.maxQueueSize}
                  onChange={(event) =>
                    setZones((current) =>
                      current.map((zone) =>
                        zone.id === selectedZone.id
                          ? { ...zone, rules: { ...zone.rules, maxQueueSize: Number(event.target.value) } }
                          : zone
                      )
                    )
                  }
                />
                <button onClick={() => void updateSelectedZone()} disabled={pendingActionKey === "update-zone"}>
                  {pendingActionKey === "update-zone" ? "Сохраняем..." : "Сохранить настройки зоны"}
                </button>
              </details>
            </div>
          )}
        </article>
      </section>

      <section className="grid">
        <article className="card">
          <div className="section-header">
            <div>
              <h2>Отправить сигнал загрузки</h2>
              <p className="muted">
                Используйте этот блок, чтобы показать обновление загрузки зоны, запись события в history и изменение
                статуса при перегрузке.
              </p>
            </div>
          </div>

          <label className="field-label" htmlFor="occupancy-zone">
            Зона
          </label>
          <select
            id="occupancy-zone"
            value={occupancyForm.zoneId}
            onChange={(event) => setOccupancyForm((current) => ({ ...current, zoneId: event.target.value }))}
          >
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="occupancy-value">
            Текущее количество людей в зоне
          </label>
          <input
            id="occupancy-value"
            value={occupancyForm.occupancy}
            onChange={(event) => setOccupancyForm((current) => ({ ...current, occupancy: event.target.value }))}
            placeholder="Например, 50"
          />

          <label className="field-label" htmlFor="occupancy-source">
            Источник сигнала
          </label>
          <select
            id="occupancy-source"
            value={occupancyForm.source}
            onChange={(event) => setOccupancyForm((current) => ({ ...current, source: event.target.value }))}
          >
            <option value="admin_web">Админ-панель</option>
            <option value="sensor">Сенсор</option>
            <option value="camera_counter">Камера / счетчик</option>
          </select>

          <label className="field-label" htmlFor="occupancy-observed">
            Время наблюдения
          </label>
          <input
            id="occupancy-observed"
            type="datetime-local"
            value={occupancyForm.observedAt}
            onChange={(event) => setOccupancyForm((current) => ({ ...current, observedAt: event.target.value }))}
          />

          <div className={`notice ${willBeOverloaded ? "warning" : "info"}`}>
            {occupancyTargetZone ? (
              willBeOverloaded ? (
                <span>
                  После отправки ожидается <strong>перегрузка</strong>: {predictedOccupancyPct}% при пороге{" "}
                  {occupancyTargetZone.rules.overloadThresholdPct}%.
                </span>
              ) : (
                <span>
                  После отправки обновятся текущая загрузка и latest telemetry: {predictedOccupancyPct}% при пороге{" "}
                  {occupancyTargetZone.rules.overloadThresholdPct}%.
                </span>
              )
            ) : (
              <span>Выберите зону для отправки сигнала.</span>
            )}
          </div>

          <button onClick={() => void sendOccupancyUpdate()} disabled={pendingActionKey === "occupancy" || !occupancyForm.zoneId}>
            {pendingActionKey === "occupancy" ? "Отправляем..." : "Отправить сигнал загрузки"}
          </button>
        </article>

        <article className="card">
          <div className="section-header">
            <div>
              <h2>Latest telemetry</h2>
              <p className="muted">Telemetry — это последний сохраненный снимок загрузки зоны.</p>
            </div>
          </div>

          {!latestTelemetry ? (
            <p className="empty-text">Для выбранной зоны пока нет telemetry snapshot.</p>
          ) : (
            <div className="metrics-grid">
              <div className="metric">
                <span className="metric-label">Зона</span>
                <strong>{zoneNameById[latestTelemetry.zoneId] ?? latestTelemetry.zoneId}</strong>
              </div>
              <div className="metric">
                <span className="metric-label">Загрузка</span>
                <strong>{latestTelemetry.occupancy} человек</strong>
              </div>
              <div className="metric">
                <span className="metric-label">Источник</span>
                <strong>{formatSource(latestTelemetry.source)}</strong>
              </div>
              <div className="metric">
                <span className="metric-label">Зафиксировано</span>
                <strong>{formatDateTime(latestTelemetry.observedAt)}</strong>
              </div>
              <div className="metric">
                <span className="metric-label">Обновлено в MongoDB</span>
                <strong>{formatDateTime(latestTelemetry.updatedAt)}</strong>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="card">
        <div className="section-header">
          <div>
            <h2>History</h2>
            <p className="muted">History — это журнал последних occupancy signals по выбранной зоне.</p>
          </div>
        </div>

        {history.length === 0 ? (
          <p className="empty-text">История для выбранной зоны пока пустая.</p>
        ) : (
          <div className="stack">
            {history.map((item) => (
              <div className="list-item history-item" key={item.eventId}>
                <div>
                  <div className="card-title-row">
                    <strong>{zoneNameById[item.zoneId] ?? item.zoneId}</strong>
                    <span className={`badge ${getPublishTone(item.publishStatus)}`}>{formatPublishStatus(item.publishStatus)}</span>
                  </div>
                  <p className="muted">
                    Загрузка: {item.occupancy} • Источник: {formatSource(item.source)} • Наблюдение: {formatDateTime(item.observedAt)}
                  </p>
                  <p className="muted">Событие создано: {formatDateTime(item.createdAt)}</p>
                  {item.lastError ? <p className="error-text">Ошибка публикации: {item.lastError}</p> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-header">
          <div>
            <h2>Уведомления администратора</h2>
            <p className="muted">Здесь особенно важно уведомление о перегрузке после отправки сигнала выше порога.</p>
          </div>
        </div>

        {notifications.length === 0 ? (
          <p className="empty-text">Пока уведомлений нет.</p>
        ) : (
          <div className="stack">
            {notifications.map((notification) => {
              const translatedNotification = formatNotification(notification, zoneNameById);
              return (
                <div className="list-item notification-item" key={notification.id}>
                  <div>
                    <div className="card-title-row">
                      <strong>{translatedNotification.title}</strong>
                      <span className={`badge ${getStatusTone(notification.title.toLowerCase() === "zone overloaded" ? "overloaded" : "open")}`}>
                        {notification.readAt ? "Прочитано" : "Новое"}
                      </span>
                    </div>
                    <p>{translatedNotification.body}</p>
                    <p className="muted">{formatDateTime(notification.createdAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <details className="card details-card">
        <summary>Дополнительно: создать новую зону</summary>
        <label className="field-label" htmlFor="new-zone-name">
          Название зоны
        </label>
        <input
          id="new-zone-name"
          value={zoneForm.name}
          onChange={(event) => setZoneForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="Например, Большая столовая"
        />
        <label className="field-label" htmlFor="new-zone-type">
          Тип зоны
        </label>
        <select
          id="new-zone-type"
          value={zoneForm.type}
          onChange={(event) => setZoneForm((current) => ({ ...current, type: event.target.value as ZoneType }))}
        >
          <option value="dining_zone">Столовая</option>
          <option value="coworking_zone">Коворкинг</option>
        </select>
        <label className="field-label" htmlFor="new-zone-capacity">
          Вместимость
        </label>
        <input
          id="new-zone-capacity"
          value={zoneForm.capacity}
          onChange={(event) => setZoneForm((current) => ({ ...current, capacity: event.target.value }))}
          placeholder="80"
        />
        <div className="checkbox-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={zoneForm.queueEnabled}
              onChange={(event) => setZoneForm((current) => ({ ...current, queueEnabled: event.target.checked }))}
            />
            Включить очередь
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={zoneForm.reservationEnabled}
              onChange={(event) => setZoneForm((current) => ({ ...current, reservationEnabled: event.target.checked }))}
            />
            Включить бронирование
          </label>
        </div>
        <div className="form-grid">
          <div>
            <label className="field-label" htmlFor="new-zone-threshold">
              Порог перегрузки, %
            </label>
            <input
              id="new-zone-threshold"
              value={zoneForm.overloadThresholdPct}
              onChange={(event) => setZoneForm((current) => ({ ...current, overloadThresholdPct: event.target.value }))}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="new-zone-service">
              Минут на человека в очереди
            </label>
            <input
              id="new-zone-service"
              value={zoneForm.estimatedServiceMinutesPerPerson}
              onChange={(event) => setZoneForm((current) => ({ ...current, estimatedServiceMinutesPerPerson: event.target.value }))}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="new-zone-slot">
              Длительность слота
            </label>
            <input
              id="new-zone-slot"
              value={zoneForm.reservationSlotMinutes}
              onChange={(event) => setZoneForm((current) => ({ ...current, reservationSlotMinutes: event.target.value }))}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="new-zone-window">
              Окно бронирования, дней
            </label>
            <input
              id="new-zone-window"
              value={zoneForm.reservationWindowDays}
              onChange={(event) => setZoneForm((current) => ({ ...current, reservationWindowDays: event.target.value }))}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="new-zone-queue">
              Максимальный размер очереди
            </label>
            <input
              id="new-zone-queue"
              value={zoneForm.maxQueueSize}
              onChange={(event) => setZoneForm((current) => ({ ...current, maxQueueSize: event.target.value }))}
            />
          </div>
        </div>
        <button onClick={() => void createZone()} disabled={pendingActionKey === "create-zone"}>
          {pendingActionKey === "create-zone" ? "Создаем..." : "Создать зону"}
        </button>
      </details>
    </div>
  );
}
