const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:8080/api";

async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {})
    }
  });
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`${response.status} ${payload}`);
  }
  return response.json() as Promise<T>;
}

async function waitForHealth(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Gateway health check timed out");
}

async function waitFor<T>(factory: () => Promise<T>, predicate: (value: T) => boolean, errorMessage: string): Promise<T> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const value = await factory();
    if (predicate(value)) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(errorMessage);
}

async function main(): Promise<void> {
  await waitForHealth();

  const studentLogin = await api<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "student@example.com",
      password: "Password123!"
    })
  });

  const zones = await api<Array<{ id: string; type: string }>>("/zones", {}, studentLogin.token);
  const diningZone = zones.find((zone) => zone.type === "dining_zone");
  const coworkingZone = zones.find((zone) => zone.type === "coworking_zone");
  if (!diningZone || !coworkingZone) {
    throw new Error("Expected dining and coworking zones");
  }

  await api(`/queues/${diningZone.id}/join`, { method: "POST" }, studentLogin.token);
  const queueState = await api<{ inQueue: boolean }>(`/queues/${diningZone.id}/me`, {}, studentLogin.token);
  if (!queueState.inQueue) {
    throw new Error("Student was not added to queue");
  }

  await api(
    "/reservations",
    {
      method: "POST",
      body: JSON.stringify({
        zoneId: coworkingZone.id,
        seatNumber: 1,
        slotStart: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      })
    },
    studentLogin.token
  );

  const notifications = await waitFor(
    () => api<Array<{ title: string }>>("/notifications/me", {}, studentLogin.token),
    (items) => items.length > 0,
    "Expected notifications after queue/reservation operations"
  );

  const adminLogin = await api<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "system_admin@example.com",
      password: "Password123!"
    })
  });

  await api(
    "/occupancy-events",
    {
      method: "POST",
      body: JSON.stringify({
        zoneId: diningZone.id,
        occupancy: 110,
        source: "smoke_test"
      })
    },
    adminLogin.token
  );

  const telemetry = await waitFor(
    () => api<Record<string, unknown>>(`/telemetry/${diningZone.id}/latest`, {}, adminLogin.token),
    (payload) => Number(payload.occupancy ?? 0) === 110,
    "Expected telemetry snapshot after occupancy ingest"
  );
  console.log("Smoke tests passed", {
    queueState,
    notificationsCount: notifications.length,
    telemetry
  });
}

void main();
