import { Injectable } from "@nestjs/common";
import {
  argon2id,
  hash as argon2Hash,
  needsRehash,
  verify as argon2Verify,
  type HashOptions,
} from "argon2";

export const ARGON2_OPTIONS: HashOptions = {
  memoryCost: 19_456,
  parallelism: 1,
  timeCost: 2,
  type: argon2id,
};

const DUMMY_PASSWORD = "tripforge-dummy-password-verification";
const DUMMY_HASH = argon2Hash(DUMMY_PASSWORD, ARGON2_OPTIONS);

@Injectable()
export class PasswordHasherService {
  hash(password: string): Promise<string> {
    return argon2Hash(password, ARGON2_OPTIONS);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return argon2Verify(passwordHash, password);
  }

  async verifyDummy(password: string): Promise<void> {
    await argon2Verify(await DUMMY_HASH, password);
  }

  needsRehash(passwordHash: string): boolean {
    return needsRehash(passwordHash, ARGON2_OPTIONS);
  }
}
