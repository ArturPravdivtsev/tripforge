import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";

import { AuthRepository } from "./auth.repository";
import type { AuthenticatedUser } from "./auth.types";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import { normalizeEmail } from "./email-normalizer";
import { PasswordHasherService } from "./password/password-hasher.service";
import { SessionService } from "./session/session.service";

type AuthenticationResult = {
  rawToken: string;
  user: AuthenticatedUser;
};

type PostgreSqlError = {
  cause?: unknown;
  code?: string;
  constraint?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordHasher: PasswordHasherService,
    private readonly sessionService: SessionService,
  ) {}

  async register(input: RegisterDto): Promise<AuthenticationResult> {
    const email = normalizeEmail(input.email);
    let passwordHash: string;

    try {
      passwordHash = await this.passwordHasher.hash(input.password);
    } catch {
      throw this.internalFailure();
    }

    const session = this.sessionService.prepare();

    try {
      const user = await this.authRepository.createUserWithCredentialAndSession({
        displayName: input.displayName?.trim(),
        email,
        expiresAt: session.expiresAt,
        passwordHash,
        tokenHash: session.tokenHash,
      });

      return { rawToken: session.rawToken, user };
    } catch (error) {
      if (this.isDuplicateEmail(error)) {
        throw new ConflictException({
          code: "ACCOUNT_ALREADY_EXISTS",
          message: "An account with this email already exists",
        });
      }

      throw this.internalFailure();
    }
  }

  async login(input: LoginDto): Promise<AuthenticationResult> {
    let identity: Awaited<
      ReturnType<AuthRepository["findPasswordIdentityByEmail"]>
    >;

    try {
      identity = await this.authRepository.findPasswordIdentityByEmail(
        normalizeEmail(input.email),
      );
    } catch {
      throw this.internalFailure();
    }

    if (!identity) {
      try {
        await this.passwordHasher.verifyDummy(input.password);
      } catch {
        throw this.internalFailure();
      }

      throw this.invalidCredentials();
    }

    let passwordMatches: boolean;

    try {
      passwordMatches = await this.passwordHasher.verify(
        identity.passwordHash,
        input.password,
      );
    } catch {
      throw this.internalFailure();
    }

    if (!passwordMatches) {
      throw this.invalidCredentials();
    }

    if (this.passwordHasher.needsRehash(identity.passwordHash)) {
      try {
        const passwordHash = await this.passwordHasher.hash(input.password);
        await this.authRepository.updatePasswordHash(
          identity.id,
          identity.passwordHash,
          passwordHash,
        );
      } catch {
        throw this.internalFailure();
      }
    }

    const user: AuthenticatedUser = {
      displayName: identity.displayName,
      email: identity.email,
      id: identity.id,
    };
    const rawToken = await this.sessionService.create(user.id);

    return { rawToken, user };
  }

  private invalidCredentials(): HttpException {
    return new HttpException(
      {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      },
      HttpStatus.UNAUTHORIZED,
    );
  }

  private internalFailure(): InternalServerErrorException {
    return new InternalServerErrorException("Internal server error");
  }

  private isDuplicateEmail(error: unknown): boolean {
    let currentError: unknown = error;
    const seenErrors = new Set<unknown>();

    while (
      typeof currentError === "object" &&
      currentError !== null &&
      !seenErrors.has(currentError)
    ) {
      seenErrors.add(currentError);
      const databaseError = currentError as PostgreSqlError;

      if (
        databaseError.code === "23505" &&
        databaseError.constraint === "users_email_unique"
      ) {
        return true;
      }

      currentError = databaseError.cause;
    }

    return false;
  }
}
