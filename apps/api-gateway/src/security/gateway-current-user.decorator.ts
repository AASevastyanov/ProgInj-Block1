import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const GatewayCurrentUser = createParamDecorator((_, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ user?: Record<string, unknown> }>();
  return request.user ?? null;
});

