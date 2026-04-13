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
  occupancyPct: number;
  rules?: ZoneRules | null;
};

type QueueState = {
  zoneId?: string;
  inQueue: boolean;
  position?: number;
  queueLength?: number;
  estimatedWaitMinutes?: number;
  joinedAt?: string;
};

type QueueSummary = {
  zoneId: string;
  queueLength: number;
};

type Reservation = {
  id: string;
  zoneId: string;
  seatNumber: number;
  slotStart: string;
  slotEnd: string;
  status: string;
};

type Notification = {
  id: string;
  title: string;
  body: string;
  zoneId?: string | null;
  readAt: string | null;
  createdAt: string;
};

type Notice = {
  tone: "success" | "error" | "info";
  message: string;
};

type ReservationFormState = {
  seatNumber: string;
  slotStart: string;
};

const TOKEN_KEY = "qoms-user-token";
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
  "queue joined": "Вы встали в очередь",
  "queue left": "Вы покинули очередь",
  "reservation created": "Бронирование создано",
  "reservation cancelled": "Бронирование отменено",
  "zone overloaded": "Зона перегружена"
};

const errorTranslations: Record<string, string> = {
  "Fill seat number and slot start": "Укажите номер места и время начала бронирования.",
  "Missing user context": "Пользователь не определен. Войдите снова.",
  "Queue is available only for dining_zone": "Очередь доступна только для зоны столовой.",
  "Queue is disabled for this zone": "Для этой зоны очередь отключена.",
  "Queue is full": "Очередь заполнена.",
  "Zone is closed": "Зона сейчас закрыта.",
  "Reservations are disabled for this zone": "Для этой зоны бронирование отключено.",
  "Reservation is available only for coworking_zone": "Бронирование доступно только для зоны коворкинга.",
  "Selected seat is already reserved for this slot": "Это место уже занято на выбранное время.",
  "Seat number exceeds zone capacity": "Номер места превышает вместимость зоны.",
  "Invalid slotStart": "Некорректное время начала бронирования.",
  "Reservation exceeds allowed booking window": "Бронирование выходит за допустимое окно записи.",
  "Active queue entry not found": "Активная запись в очереди не найдена.",
  "Active reservation not found": "Активное бронирование не найдено.",
  "Notification not found": "Уведомление не найдено."
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

function formatZoneType(type: ZoneType): string {
  return zoneTypeLabels[type];
}

function getNotificationTone(title: string): "success" | "warning" | "danger" | "neutral" {
  const normalized = title.toLowerCase();
  if (normalized === "zone overloaded") {
    return "danger";
  }
  if (normalized === "queue joined" || normalized === "reservation created") {
    return "success";
  }
  if (normalized === "queue left" || normalized === "reservation cancelled") {
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

function getDefaultReservationStartValue(): string {
  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  return toDateTimeLocalValue(nextHour);
}

function formatWaitTime(minutes: number): string {
  if (minutes <= 0) {
    return "Без ожидания";
  }
  return `${minutes} мин`;
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
  const seatMatch = /seat (\d+)/i.exec(notification.body);
  const occupancyMatch = /occupancy (\d+)/i.exec(notification.body);

  switch (normalizedTitle) {
    case "queue joined":
      return {
        title: translatedTitle,
        body: zoneName ? `Вы добавлены в очередь в зоне «${zoneName}».` : "Вы добавлены в очередь.",
        tone: getNotificationTone(notification.title)
      };
    case "queue left":
      return {
        title: translatedTitle,
        body: zoneName ? `Вы вышли из очереди в зоне «${zoneName}».` : "Вы вышли из очереди.",
        tone: getNotificationTone(notification.title)
      };
    case "reservation created":
      return {
        title: translatedTitle,
        body: zoneName
          ? `Бронирование в зоне «${zoneName}» подтверждено${seatMatch ? `, место ${seatMatch[1]}` : ""}.`
          : replaceKnownZoneIds(notification.body, zoneNameById),
        tone: getNotificationTone(notification.title)
      };
    case "reservation cancelled":
      return {
        title: translatedTitle,
        body: zoneName ? `Бронирование в зоне «${zoneName}» отменено.` : "Бронирование отменено.",
        tone: getNotificationTone(notification.title)
      };
    case "zone overloaded":
      return {
        title: translatedTitle,
        body: zoneName
          ? `Зона «${zoneName}» перегружена${occupancyMatch ? `: сейчас ${occupancyMatch[1]} посетителей.` : "."}`
          : replaceKnownZoneIds(notification.body, zoneNameById),
        tone: getNotificationTone(notification.title)
      };
    default:
      return {
        title: translatedTitle,
        body: replaceKnownZoneIds(notification.body, zoneNameById),
        tone: getNotificationTone(notification.title)
      };
  }
}

function getQueueLength(queueState?: QueueState, queueSummary?: QueueSummary): number {
  return queueState?.queueLength ?? queueSummary?.queueLength ?? 0;
}

function getDisplayQueuePosition(queueState?: QueueState): number | null {
  if (!queueState?.inQueue) {
    return null;
  }
  // Backend should already return 1-based position; clamp here so the UI never shows "0".
  return Math.max(1, queueState.position ?? 1);
}

function getWaitMinutes(zone: Zone, queueState?: QueueState, queueSummary?: QueueSummary): number {
  if (queueState?.inQueue) {
    return Math.max(
      0,
      queueState.estimatedWaitMinutes ?? (Math.max(1, queueState.position ?? 1) - 1) * (zone.rules?.estimatedServiceMinutesPerPerson ?? 3)
    );
  }
  return getQueueLength(queueState, queueSummary) * (zone.rules?.estimatedServiceMinutesPerPerson ?? 3);
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [email, setEmail] = useState("student@example.com");
  const [password, setPassword] = useState("Password123!");
  const [zones, setZones] = useState<Zone[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [queueStates, setQueueStates] = useState<Record<string, QueueState>>({});
  const [queueSummaries, setQueueSummaries] = useState<Record<string, QueueSummary>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [reservationForms, setReservationForms] = useState<Record<string, ReservationFormState>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");

  const diningZones = useMemo(() => zones.filter((zone) => zone.type === "dining_zone"), [zones]);
  const coworkingZones = useMemo(() => zones.filter((zone) => zone.type === "coworking_zone"), [zones]);
  const zoneNameById = useMemo(
    () => Object.fromEntries(zones.map((zone) => [zone.id, zone.name])),
    [zones]
  );
  const unreadNotificationsCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications]
  );
  const activeReservations = useMemo(
    () => reservations.filter((reservation) => reservation.status === "active"),
    [reservations]
  );
  const activeReservationsByZone = useMemo(
    () =>
      activeReservations.reduce<Record<string, Reservation[]>>((accumulator, reservation) => {
        accumulator[reservation.zoneId] = [...(accumulator[reservation.zoneId] ?? []), reservation];
        return accumulator;
      }, {}),
    [activeReservations]
  );

  useEffect(() => {
    if (token) {
      void refreshAll(token);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshAll(token, { showSpinner: false, showErrorNotice: false });
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [token]);

  async function refreshAll(
    activeToken = token,
    options: { showSpinner?: boolean; showErrorNotice?: boolean } = {}
  ) {
    if (!activeToken) {
      return;
    }

    const { showSpinner = true, showErrorNotice = true } = options;
    if (showSpinner) {
      setIsRefreshing(true);
    }

    try {
      const [me, zonesData, reservationsData, notificationsData] = await Promise.all([
        api<{ email: string }>("/auth/me", {}, activeToken),
        api<Zone[]>("/zones", {}, activeToken),
        api<Reservation[]>("/reservations/me", {}, activeToken),
        api<Notification[]>("/notifications/me", {}, activeToken)
      ]);
      setUserEmail(me.email);
      setZones(zonesData);
      setReservations(reservationsData);
      setNotifications(notificationsData);

      const diningZoneItems = zonesData.filter((zone) => zone.type === "dining_zone");
      const [queueStateEntries, queueSummaryEntries] = await Promise.all([
        Promise.all(
          diningZoneItems.map(async (zone) => [zone.id, await api<QueueState>(`/queues/${zone.id}/me`, {}, activeToken)] as const)
        ),
        Promise.all(
          diningZoneItems.map(
            async (zone) => [zone.id, await api<QueueSummary>(`/queues/${zone.id}/state`, {}, activeToken)] as const
          )
        )
      ]);

      setQueueStates(Object.fromEntries(queueStateEntries));
      setQueueSummaries(Object.fromEntries(queueSummaryEntries));
      setReservationForms((current) => {
        const next = { ...current };
        zonesData
          .filter((zone) => zone.type === "coworking_zone")
          .forEach((zone) => {
            next[zone.id] = {
              seatNumber: current[zone.id]?.seatNumber ?? "",
              slotStart: current[zone.id]?.slotStart || getDefaultReservationStartValue()
            };
          });
        return next;
      });
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

  async function onLogin(event: FormEvent) {
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
        message: "Вход выполнен. Данные пользователя загружаются."
      });
    } catch (err) {
      setNotice({
        tone: "error",
        message: translateErrorMessage((err as Error).message)
      });
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setZones([]);
    setReservations([]);
    setNotifications([]);
    setQueueStates({});
    setQueueSummaries({});
    setUserEmail("");
    setNotice(null);
    setLastUpdatedAt("");
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

  async function joinQueue(zoneId: string) {
    if (!token) return;
    const zoneName = zoneNameById[zoneId] ?? "выбранной зоне";
    await withAction(
      `join:${zoneId}`,
      async () => {
        await api(`/queues/${zoneId}/join`, { method: "POST" }, token);
        await refreshAll(token, { showSpinner: false });
      },
      `Вы встали в очередь в зоне «${zoneName}».`
    );
  }

  async function leaveQueue(zoneId: string) {
    if (!token) return;
    const zoneName = zoneNameById[zoneId] ?? "выбранной зоне";
    await withAction(
      `leave:${zoneId}`,
      async () => {
        await api(`/queues/${zoneId}/leave`, { method: "POST" }, token);
        await refreshAll(token, { showSpinner: false });
      },
      `Вы покинули очередь в зоне «${zoneName}».`
    );
  }

  async function createReservation(zoneId: string) {
    if (!token) return;
    const form = reservationForms[zoneId];
    if (!form?.seatNumber || !form?.slotStart) {
      setNotice({
        tone: "error",
        message: translateErrorMessage("Fill seat number and slot start")
      });
      return;
    }
    const zoneName = zoneNameById[zoneId] ?? "выбранной зоне";
    await withAction(
      `reserve:${zoneId}`,
      async () => {
        await api(
          "/reservations",
          {
            method: "POST",
            body: JSON.stringify({
              zoneId,
              seatNumber: Number(form.seatNumber),
              slotStart: new Date(form.slotStart).toISOString()
            })
          },
          token
        );
        await refreshAll(token, { showSpinner: false });
      },
      `Бронирование в зоне «${zoneName}» создано.`
    );
  }

  async function cancelReservation(reservationId: string, zoneId: string) {
    if (!token) return;
    const zoneName = zoneNameById[zoneId] ?? "выбранной зоне";
    await withAction(
      `cancel:${reservationId}`,
      async () => {
        await api(`/reservations/${reservationId}`, { method: "DELETE" }, token);
        await refreshAll(token, { showSpinner: false });
      },
      `Бронирование в зоне «${zoneName}» отменено.`
    );
  }

  async function markNotificationRead(id: string) {
    if (!token) return;
    await withAction(
      `read:${id}`,
      async () => {
        await api(`/notifications/${id}/read`, { method: "PATCH" }, token);
        await refreshAll(token, { showSpinner: false });
      },
      "Уведомление отмечено как прочитанное."
    );
  }

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="card auth-card">
          <span className="eyebrow">Демо для студента</span>
          <h1>Очередь в столовую и бронирование коворкинга</h1>
          <p className="muted">
            На этой странице студент видит загрузку зон, может встать в очередь в столовую, оформить бронирование в
            коворкинге и сразу увидеть эффект в уведомлениях.
          </p>
          <div className="info-banner">
            <strong>Тестовый вход:</strong> student@example.com / Password123!
          </div>
          {notice ? <div className={`notice ${notice.tone}`}>{notice.message}</div> : null}
          <form onSubmit={onLogin}>
            <label className="field-label" htmlFor="email">
              Электронная почта
            </label>
            <input id="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@example.com" />
            <label className="field-label" htmlFor="password">
              Пароль
            </label>
            <input
              id="password"
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
            <span className="eyebrow">Пользовательский интерфейс</span>
            <h1>Личный кабинет студента</h1>
            <p className="muted">
              Здесь видно, что происходит в столовой и коворкинге: сколько людей внутри, доступна ли зона, есть ли у
              вас очередь или активное бронирование и какие уведомления пришли после действий.
            </p>
          </div>
          <div className="hero-actions">
            <button className="secondary" onClick={() => void refreshAll()}>
              {isRefreshing ? "Обновление..." : "Обновить данные"}
            </button>
            <button onClick={logout}>Выйти</button>
          </div>
        </div>

        <div className="hero-grid">
          <div className="info-block">
            <h2>Что можно сделать на этой странице</h2>
            <p>
              Встать в очередь в столовую, посмотреть свою позицию и ожидание, создать бронирование в коворкинге и
              сразу увидеть подтверждение в интерфейсе и уведомлениях.
            </p>
          </div>
          <div className="info-block">
            <h2>Чем отличаются зоны</h2>
            <p>
              <strong>Столовая</strong> работает через очередь. <strong>Коворкинг</strong> работает через
              бронирование мест на конкретное время.
            </p>
          </div>
          <div className="info-block">
            <h2>Данные обновляются автоматически</h2>
            <p>
              Обновление происходит каждые 15 секунд и сразу после ваших действий, поэтому эффект постановки в очередь
              и создания бронирования виден без перезагрузки страницы.
            </p>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Пользователь</span>
            <strong>{userEmail}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Активных бронирований</span>
            <strong>{activeReservations.length}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Новых уведомлений</span>
            <strong>{unreadNotificationsCount}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Последнее обновление</span>
            <strong>{lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "—"}</strong>
          </div>
        </div>

        {notice ? <div className={`notice ${notice.tone}`}>{notice.message}</div> : null}
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Столовая</h2>
            <p className="muted">Здесь видно текущую загрузку, состояние очереди и примерное ожидание обслуживания.</p>
          </div>
        </div>

        <div className="grid">
          {diningZones.map((zone) => {
            const queueState = queueStates[zone.id];
            const queueSummary = queueSummaries[zone.id];
            const queuePosition = getDisplayQueuePosition(queueState);
            const queueLength = getQueueLength(queueState, queueSummary);
            const waitMinutes = getWaitMinutes(zone, queueState, queueSummary);

            return (
              <article className="card zone-card" key={zone.id}>
                <div className="card-heading">
                  <div>
                    <div className="card-title-row">
                      <h3>{zone.name}</h3>
                      <span className={`badge ${getStatusTone(zone.status)}`}>{formatStatus(zone.status)}</span>
                    </div>
                    <p className="muted">Тип зоны: {formatZoneType(zone.type)}</p>
                  </div>
                  <span className="badge neutral">{zone.occupancyPct}% загрузки</span>
                </div>

                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.min(zone.occupancyPct, 100)}%` }} />
                </div>

                <div className="metrics-grid">
                  <div className="metric">
                    <span className="metric-label">Текущая загрузка</span>
                    <strong>
                      {zone.currentOccupancy} из {zone.capacity}
                    </strong>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Мой статус</span>
                    <strong>{queueState?.inQueue ? "Вы в очереди" : "Вы не в очереди"}</strong>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Моя позиция</span>
                    <strong>{queuePosition ?? "—"}</strong>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Всего людей в очереди</span>
                    <strong>{queueLength}</strong>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Оценка ожидания</span>
                    <strong>{formatWaitTime(waitMinutes)}</strong>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Скорость обслуживания</span>
                    <strong>{zone.rules?.estimatedServiceMinutesPerPerson ?? 3} мин на человека</strong>
                  </div>
                </div>

                <div className="action-row">
                  <button
                    onClick={() => void joinQueue(zone.id)}
                    disabled={
                      pendingActionKey === `join:${zone.id}` ||
                      queueState?.inQueue ||
                      zone.status === "closed" ||
                      !zone.rules?.queueEnabled
                    }
                  >
                    {pendingActionKey === `join:${zone.id}` ? "Ставим в очередь..." : "Встать в очередь"}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => void leaveQueue(zone.id)}
                    disabled={pendingActionKey === `leave:${zone.id}` || !queueState?.inQueue}
                  >
                    {pendingActionKey === `leave:${zone.id}` ? "Выходим..." : "Покинуть очередь"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Коворкинг</h2>
            <p className="muted">
              В этой зоне студент бронирует место на конкретное время и видит свои активные бронирования по каждой
              площадке.
            </p>
          </div>
        </div>

        <div className="grid">
          {coworkingZones.map((zone) => {
            const zoneReservations = activeReservationsByZone[zone.id] ?? [];
            const availableSeats = Math.max(zone.capacity - zone.currentOccupancy, 0);

            return (
              <article className="card zone-card" key={zone.id}>
                <div className="card-heading">
                  <div>
                    <div className="card-title-row">
                      <h3>{zone.name}</h3>
                      <span className={`badge ${getStatusTone(zone.status)}`}>{formatStatus(zone.status)}</span>
                    </div>
                    <p className="muted">Тип зоны: {formatZoneType(zone.type)}</p>
                  </div>
                  <span className="badge neutral">{zone.occupancyPct}% загрузки</span>
                </div>

                <div className="progress-track">
                  <div className="progress-fill alt" style={{ width: `${Math.min(zone.occupancyPct, 100)}%` }} />
                </div>

                <div className="metrics-grid">
                  <div className="metric">
                    <span className="metric-label">Текущая загрузка</span>
                    <strong>
                      {zone.currentOccupancy} из {zone.capacity}
                    </strong>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Доступно мест</span>
                    <strong>{availableSeats}</strong>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Длительность слота</span>
                    <strong>{zone.rules?.reservationSlotMinutes ?? 60} мин</strong>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Окно бронирования</span>
                    <strong>{zone.rules?.reservationWindowDays ?? 7} дн.</strong>
                  </div>
                </div>

                <div className="subsection">
                  <h4>Создать бронирование</h4>
                  <label className="field-label" htmlFor={`seat-${zone.id}`}>
                    Номер места
                  </label>
                  <input
                    id={`seat-${zone.id}`}
                    placeholder="Например, 12"
                    value={reservationForms[zone.id]?.seatNumber ?? ""}
                    onChange={(event) =>
                      setReservationForms((current) => ({
                        ...current,
                        [zone.id]: {
                          seatNumber: event.target.value,
                          slotStart: current[zone.id]?.slotStart ?? getDefaultReservationStartValue()
                        }
                      }))
                    }
                  />

                  <label className="field-label" htmlFor={`start-${zone.id}`}>
                    Время начала
                  </label>
                  <input
                    id={`start-${zone.id}`}
                    type="datetime-local"
                    value={reservationForms[zone.id]?.slotStart ?? ""}
                    onChange={(event) =>
                      setReservationForms((current) => ({
                        ...current,
                        [zone.id]: {
                          seatNumber: current[zone.id]?.seatNumber ?? "",
                          slotStart: event.target.value
                        }
                      }))
                    }
                  />

                  <button
                    onClick={() => void createReservation(zone.id)}
                    disabled={
                      pendingActionKey === `reserve:${zone.id}` ||
                      zone.status === "closed" ||
                      !zone.rules?.reservationEnabled
                    }
                  >
                    {pendingActionKey === `reserve:${zone.id}` ? "Создаем..." : "Создать бронирование"}
                  </button>
                </div>

                <div className="subsection">
                  <h4>Мои активные бронирования</h4>
                  {zoneReservations.length === 0 ? (
                    <p className="empty-text">Активных бронирований в этой зоне пока нет.</p>
                  ) : (
                    <div className="stack">
                      {zoneReservations.map((reservation) => (
                        <div className="list-item" key={reservation.id}>
                          <div>
                            <strong>Место {reservation.seatNumber}</strong>
                            <p className="muted">
                              {formatDateTime(reservation.slotStart)} - {formatDateTime(reservation.slotEnd)}
                            </p>
                          </div>
                          <button
                            className="secondary compact"
                            onClick={() => void cancelReservation(reservation.id, reservation.zoneId)}
                            disabled={pendingActionKey === `cancel:${reservation.id}`}
                          >
                            {pendingActionKey === `cancel:${reservation.id}` ? "Отмена..." : "Отменить"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Уведомления</h2>
            <p className="muted">
              После постановки в очередь, выхода из очереди, создания или отмены бронирования здесь появляется понятное
              подтверждение действий.
            </p>
          </div>
        </div>

        <div className="grid">
          {notifications.length === 0 ? (
            <div className="card empty-card">
              <p className="empty-text">Пока нет уведомлений.</p>
            </div>
          ) : (
            notifications.map((notification) => {
              const translatedNotification = formatNotification(notification, zoneNameById);
              return (
                <article className="card notification-card" key={notification.id}>
                  <div className="card-title-row">
                    <span className={`badge ${translatedNotification.tone}`}>{notification.readAt ? "Прочитано" : "Новое"}</span>
                    <span className="muted">{formatDateTime(notification.createdAt)}</span>
                  </div>
                  <h3>{translatedNotification.title}</h3>
                  <p>{translatedNotification.body}</p>
                  {!notification.readAt ? (
                    <button
                      className="secondary"
                      onClick={() => void markNotificationRead(notification.id)}
                      disabled={pendingActionKey === `read:${notification.id}`}
                    >
                      {pendingActionKey === `read:${notification.id}` ? "Отмечаем..." : "Отметить как прочитанное"}
                    </button>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
