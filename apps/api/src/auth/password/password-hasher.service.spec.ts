import { describe, expect, it } from "vitest";

import { PasswordHasherService } from "./password-hasher.service";

describe("PasswordHasherService", () => {
  const passwordHasher = new PasswordHasherService();
  const password = " correct horse battery staple ";

  it("hashes with Argon2id and verifies the plaintext", async () => {
    const passwordHash = await passwordHasher.hash(password);

    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    await expect(passwordHasher.verify(passwordHash, password)).resolves.toBe(
      true,
    );
    await expect(
      passwordHasher.verify(passwordHash, "wrong password"),
    ).resolves.toBe(false);
    expect(passwordHasher.needsRehash(passwordHash)).toBe(false);
  });

  it("uses a random salt for each hash", async () => {
    const [firstHash, secondHash] = await Promise.all([
      passwordHasher.hash(password),
      passwordHasher.hash(password),
    ]);

    expect(firstHash).not.toBe(secondHash);
  });
});
