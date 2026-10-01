import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";
import {
  authSessions,
  passwordCredentials,
  users,
} from "../database/schema";
import type { AuthenticatedUser } from "./auth.types";

type PasswordIdentity = AuthenticatedUser & {
  passwordHash: string;
};

type RegistrationPersistence = {
  displayName?: string;
  email: string;
  expiresAt: Date;
  passwordHash: string;
  tokenHash: string;
};

@Injectable()
export class AuthRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findPasswordIdentityByEmail(
    email: string,
  ): Promise<PasswordIdentity | undefined> {
    const [identity] = await this.database
      .select({
        displayName: users.displayName,
        email: users.email,
        id: users.id,
        passwordHash: passwordCredentials.passwordHash,
      })
      .from(users)
      .innerJoin(
        passwordCredentials,
        eq(passwordCredentials.userId, users.id),
      )
      .where(eq(users.email, email))
      .limit(1);

    return identity;
  }

  async createUserWithCredentialAndSession(
    input: RegistrationPersistence,
  ): Promise<AuthenticatedUser> {
    return this.database.transaction(async (transaction) => {
      const [user] = await transaction
        .insert(users)
        .values({
          displayName: input.displayName,
          email: input.email,
        })
        .returning({
          displayName: users.displayName,
          email: users.email,
          id: users.id,
        });

      if (!user) {
        throw new Error("User insert did not return a row");
      }

      await transaction.insert(passwordCredentials).values({
        passwordHash: input.passwordHash,
        userId: user.id,
      });
      await transaction.insert(authSessions).values({
        expiresAt: input.expiresAt,
        tokenHash: input.tokenHash,
        userId: user.id,
      });

      return user;
    });
  }

  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.database.insert(authSessions).values({
      expiresAt,
      tokenHash,
      userId,
    });
  }

  async updatePasswordHash(
    userId: string,
    currentHash: string,
    passwordHash: string,
  ): Promise<void> {
    await this.database
      .update(passwordCredentials)
      .set({ passwordHash, updatedAt: new Date() })
      .where(
        and(
          eq(passwordCredentials.userId, userId),
          eq(passwordCredentials.passwordHash, currentHash),
        ),
      );
  }

  async findSessionWithUser(
    tokenHash: string,
  ): Promise<
    | (AuthenticatedUser & {
        expiresAt: Date;
        sessionId: string;
      })
    | undefined
  > {
    const [session] = await this.database
      .select({
        displayName: users.displayName,
        email: users.email,
        expiresAt: authSessions.expiresAt,
        id: users.id,
        sessionId: authSessions.id,
      })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(eq(authSessions.tokenHash, tokenHash))
      .limit(1);

    return session;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.database
      .delete(authSessions)
      .where(eq(authSessions.tokenHash, tokenHash));
  }
}
