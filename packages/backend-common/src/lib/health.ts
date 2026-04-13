export interface HealthResponse {
  status: "ok";
  service: string;
  timestamp: string;
}

export function createHealthResponse(service: string): HealthResponse {
  return {
    status: "ok",
    service,
    timestamp: new Date().toISOString()
  };
}
