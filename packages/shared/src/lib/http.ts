export const HEADER_REQUEST_ID = "x-request-id";
export const HEADER_SERVICE_TOKEN = "x-service-token";
export const HEADER_USER_ID = "x-user-id";
export const HEADER_USER_ROLE = "x-user-role";
export const HEADER_USER_EMAIL = "x-user-email";

export function isTruthy(value: string | undefined): boolean {
  return value === "true" || value === "1";
}
