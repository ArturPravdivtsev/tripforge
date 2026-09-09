import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { AuthResponse } from "@tripforge/contracts";

import { BrowserMutationGuard } from "./browser/browser-mutation.guard";
import { RequireJsonBody } from "./browser/require-json-body.decorator";
import { AuthService } from "./auth.service";
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from "./auth.types";
import { CurrentUser } from "./decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { SessionAuthGuard } from "./guards/session-auth.guard";
import {
  SessionService,
  type SessionCookieResponse,
} from "./session/session.service";

@Controller("auth")
@UseGuards(BrowserMutationGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Post("register")
  @RequireJsonBody()
  async register(
    @Body() input: RegisterDto,
    @Res({ passthrough: true }) response: SessionCookieResponse,
  ): Promise<AuthResponse> {
    const result = await this.authService.register(input);

    this.sessionService.setCookie(response, result.rawToken);

    return { user: result.user };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @RequireJsonBody()
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: SessionCookieResponse,
  ): Promise<AuthResponse> {
    const result = await this.authService.login(input);

    this.sessionService.setCookie(response, result.rawToken);

    return { user: result.user };
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): AuthResponse {
    return { user };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: SessionCookieResponse,
  ): Promise<void> {
    const rawToken = this.sessionService.readToken(request);

    try {
      if (rawToken) {
        await this.sessionService.invalidate(rawToken);
      }
    } finally {
      this.sessionService.clearCookie(response);
    }
  }
}
