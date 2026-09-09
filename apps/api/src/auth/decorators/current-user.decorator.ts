import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from "../auth.types";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.authenticatedUser) {
      throw new Error("Authenticated user context is missing");
    }

    return request.authenticatedUser;
  },
);
