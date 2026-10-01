import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";

import { REQUIRES_JSON_BODY } from "./require-json-body.decorator";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MUTATION_HEADER = "x-tripforge-request";

type BrowserRequest = {
  headers: Record<string, string | string[] | undefined>;
  method: string;
};

@Injectable()
export class BrowserMutationGuard implements CanActivate {
  private readonly webOrigin: string;

  constructor(
    configService: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.webOrigin = configService.getOrThrow<string>("WEB_ORIGIN");
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<BrowserRequest>();

    if (!MUTATION_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    if (
      this.getHeader(request, "origin") !== this.webOrigin ||
      this.getHeader(request, MUTATION_HEADER) !== "1" ||
      this.getHeader(request, "sec-fetch-site") === "cross-site"
    ) {
      throw new HttpException(
        {
          code: "CSRF_PROTECTION_FAILED",
          message: "Browser request rejected",
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const requiresJsonBody = this.reflector.getAllAndOverride<boolean>(
      REQUIRES_JSON_BODY,
      [context.getHandler(), context.getClass()],
    );

    if (
      requiresJsonBody &&
      this.getMediaType(this.getHeader(request, "content-type")) !==
        "application/json"
    ) {
      throw new HttpException(
        {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json",
        },
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    return true;
  }

  private getHeader(
    request: BrowserRequest,
    name: string,
  ): string | undefined {
    const value = request.headers[name];

    return Array.isArray(value) ? value[0] : value;
  }

  private getMediaType(contentType: string | undefined): string | undefined {
    return contentType?.split(";", 1)[0]?.trim().toLowerCase();
  }
}
