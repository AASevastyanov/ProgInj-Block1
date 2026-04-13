import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RATE_POLICY_KEY, type RatePolicyName } from "../security/gateway-auth.decorators";
import { RateLimitService } from "./rate-limit.service";

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RateLimitService) private readonly rateLimitService: RateLimitService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy =
      this.reflector.getAllAndOverride<RatePolicyName>(RATE_POLICY_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? "default_read";
    const request = context.switchToHttp().getRequest<{
      ip: string;
      user?: Record<string, unknown>;
      route?: { path?: string };
    }>();
    const response = context.switchToHttp().getResponse<{ setHeader: (name: string, value: string) => void }>();
    const principal = String(request.user?.sub ?? request.ip ?? "anonymous");
    const result = await this.rateLimitService.check(policy, principal);
    if (!result.allowed) {
      response.setHeader("Retry-After", String(result.retryAfterSeconds ?? 1));
      throw new HttpException({ message: "Too Many Requests" }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
