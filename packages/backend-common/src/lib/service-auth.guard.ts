import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { HEADER_SERVICE_TOKEN } from "@qoms/shared";

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const token = request.headers[HEADER_SERVICE_TOKEN];
    const expected = process.env.INTERNAL_SERVICE_TOKEN;
    if (!token || !expected || token !== expected) {
      throw new UnauthorizedException("Missing or invalid service token");
    }
    return true;
  }
}

