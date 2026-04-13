import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { RequestUserContext } from "@qoms/shared";
import { HEADER_USER_EMAIL, HEADER_USER_ID, HEADER_USER_ROLE } from "@qoms/shared";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUserContext | null => {
    const request = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const userId = request.headers[HEADER_USER_ID];
    const role = request.headers[HEADER_USER_ROLE];
    const email = request.headers[HEADER_USER_EMAIL];
    if (!userId || !role) {
      return null;
    }
    return {
      userId,
      role: role as RequestUserContext["role"],
      email
    };
  }
);

