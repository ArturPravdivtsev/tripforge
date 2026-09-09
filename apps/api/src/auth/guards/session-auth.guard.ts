import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";

import type { AuthenticatedRequest } from "../auth.types";
import { SessionService } from "../session/session.service";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawToken = this.sessionService.readToken(request);
    const user = rawToken
      ? await this.sessionService.resolve(rawToken)
      : undefined;

    if (!user) {
      throw new HttpException(
        { code: "UNAUTHENTICATED", message: "Authentication required" },
        HttpStatus.UNAUTHORIZED,
      );
    }

    request.authenticatedUser = user;

    return true;
  }
}
