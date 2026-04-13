import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import jwt from "jsonwebtoken";
import { GATEWAY_ROLES_KEY, IS_PUBLIC_KEY } from "./gateway-auth.decorators";

@Injectable()
export class GatewayAuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: Record<string, unknown>;
    }>();
    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const token = authorization.slice("Bearer ".length);
    try {
      const claims = jwt.verify(token, process.env.JWT_SECRET ?? "super-secret-jwt-key") as Record<string, unknown>;
      request.user = claims;
      const requiredRoles = this.reflector.getAllAndOverride<string[]>(GATEWAY_ROLES_KEY, [
        context.getHandler(),
        context.getClass()
      ]);
      if (requiredRoles && requiredRoles.length > 0) {
        const role = String(claims.role ?? "");
        if (!requiredRoles.includes(role)) {
          throw new ForbiddenException("Insufficient role");
        }
      }
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException("Invalid token");
    }
  }
}
