import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AuthRepository } from "../auth.repository";
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from "../auth.types";
import {
  getSessionCookieConfiguration,
  SESSION_LIFETIME_MS,
  type SessionCookieOptions,
} from "./session-cookie";
import { generateSessionToken, hashSessionToken } from "./session-token";

export type SessionMaterial = {
  expiresAt: Date;
  rawToken: string;
  tokenHash: string;
};

export type SessionCookieResponse = {
  clearCookie(name: string, options: Omit<SessionCookieOptions, "maxAge">): void;
  cookie(name: string, value: string, options: SessionCookieOptions): void;
};

export type ResolvedSession = AuthenticatedUser & {
  expiresAt: Date;
  sessionId: string;
};

@Injectable()
export class SessionService {
  private readonly cookieConfiguration;

  constructor(
    private readonly authRepository: AuthRepository,
    configService: ConfigService,
  ) {
    this.cookieConfiguration = getSessionCookieConfiguration(
      configService.getOrThrow<string>("NODE_ENV"),
    );
  }

  prepare(): SessionMaterial {
    const rawToken = generateSessionToken();

    return {
      expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
      rawToken,
      tokenHash: hashSessionToken(rawToken),
    };
  }

  async create(userId: string): Promise<string> {
    const session = this.prepare();

    try {
      await this.authRepository.createSession(
        userId,
        session.tokenHash,
        session.expiresAt,
      );
    } catch {
      throw new InternalServerErrorException("Internal server error");
    }

    return session.rawToken;
  }

  readToken(request: AuthenticatedRequest): string | undefined {
    const token = request.cookies?.[this.cookieConfiguration.name];

    return typeof token === "string" && token.length > 0 ? token : undefined;
  }

  async resolve(rawToken: string): Promise<AuthenticatedUser | undefined> {
    const session = await this.resolveSession(rawToken);

    if (!session) {
      return undefined;
    }

    return {
      displayName: session.displayName,
      email: session.email,
      id: session.id,
    };
  }

  async resolveSession(rawToken: string): Promise<ResolvedSession | undefined> {
    const tokenHash = hashSessionToken(rawToken);
    let session: Awaited<
      ReturnType<AuthRepository["findSessionWithUser"]>
    >;

    try {
      session = await this.authRepository.findSessionWithUser(tokenHash);
    } catch {
      throw new InternalServerErrorException("Internal server error");
    }

    if (!session) {
      return undefined;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      try {
        await this.authRepository.deleteSession(tokenHash);
      } catch {
        // Cleanup is opportunistic; an expired session remains unauthenticated.
      }

      return undefined;
    }

    return session;
  }

  cookieName(): string {
    return this.cookieConfiguration.name;
  }

  async invalidate(rawToken: string): Promise<void> {
    try {
      await this.authRepository.deleteSession(hashSessionToken(rawToken));
    } catch {
      throw new InternalServerErrorException("Internal server error");
    }
  }

  setCookie(response: SessionCookieResponse, rawToken: string): void {
    response.cookie(
      this.cookieConfiguration.name,
      rawToken,
      this.cookieConfiguration.options,
    );
  }

  clearCookie(response: SessionCookieResponse): void {
    response.clearCookie(this.cookieConfiguration.name, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: this.cookieConfiguration.options.secure,
    });
  }
}
