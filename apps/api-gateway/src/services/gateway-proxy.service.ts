import { HttpException, Injectable } from "@nestjs/common";
import { HEADER_REQUEST_ID, HEADER_SERVICE_TOKEN, HEADER_USER_EMAIL, HEADER_USER_ID, HEADER_USER_ROLE } from "@qoms/shared";
import axios, { AxiosError, type Method } from "axios";

@Injectable()
export class GatewayProxyService {
  async forward<T>(params: {
    service: "user" | "zone" | "queue" | "reservation" | "notification" | "monitoring";
    method: Method;
    path: string;
    requestId: string;
    user?: Record<string, unknown> | null;
    body?: unknown;
    query?: Record<string, unknown>;
  }): Promise<T> {
    const baseUrl = this.resolveBaseUrl(params.service);
    try {
      const response = await axios.request<T>({
        url: `${baseUrl}${params.path}`,
        method: params.method,
        data: params.body,
        params: params.query,
        headers: this.buildHeaders(params.requestId, params.user),
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 500;
      const payload = axiosError.response?.data ?? { message: axiosError.message };
      throw new HttpException(payload as Record<string, unknown>, status);
    }
  }

  private buildHeaders(requestId: string, user?: Record<string, unknown> | null): Record<string, string> {
    const headers: Record<string, string> = {
      [HEADER_REQUEST_ID]: requestId,
      [HEADER_SERVICE_TOKEN]: process.env.INTERNAL_SERVICE_TOKEN ?? "internal-service-token"
    };
    if (user) {
      headers[HEADER_USER_ID] = String(user.sub ?? "");
      headers[HEADER_USER_ROLE] = String(user.role ?? "");
      headers[HEADER_USER_EMAIL] = String(user.email ?? "");
    }
    return headers;
  }

  private resolveBaseUrl(service: string): string {
    const map: Record<string, string> = {
      user: process.env.USER_SERVICE_URL ?? "http://user-service:3001",
      zone: process.env.ZONE_MANAGEMENT_SERVICE_URL ?? "http://zone-management-service:3002",
      queue: process.env.QUEUE_SERVICE_URL ?? "http://queue-service:3003",
      reservation: process.env.RESERVATION_SERVICE_URL ?? "http://reservation-service:3004",
      notification: process.env.NOTIFICATION_SERVICE_URL ?? "http://notification-service:3005",
      monitoring: process.env.MONITORING_SERVICE_URL ?? "http://monitoring-event-ingestion-service:3006"
    };
    return map[service];
  }
}

