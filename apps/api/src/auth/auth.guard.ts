import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service.js";
import type { AuthenticatedRequest } from "./auth.types.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.getBearerToken(request);
    if (!token) throw new UnauthorizedException("未登录");

    (request as AuthenticatedRequest).user = await this.authService.validateSession(token);
    return true;
  }

  private getBearerToken(request: Request): string | null {
    const authorization = request.header("authorization");
    if (!authorization) return null;
    const [scheme, token] = authorization.split(" ");
    if (scheme !== "Bearer" || !token) return null;
    return token;
  }
}
