import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";

import { RegisterDto } from "./register.dto";

async function validationMessages(input: object) {
  const dto = plainToInstance(RegisterDto, input);
  const errors = await validate(dto, {
    forbidNonWhitelisted: true,
    whitelist: true,
  });

  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe("RegisterDto", () => {
  const validInput = {
    email: "user@example.com",
    password: "a valid password",
  };

  it.each([
    [{ ...validInput, email: "not-an-email" }, "email must be an email"],
    [
      { ...validInput, password: "too short" },
      "password must be longer than or equal to 15 characters",
    ],
    [
      { ...validInput, password: "x".repeat(129) },
      "password must be shorter than or equal to 128 characters",
    ],
    [
      { ...validInput, displayName: "   " },
      "displayName must be longer than or equal to 1 characters",
    ],
    [
      { ...validInput, unexpected: true },
      "property unexpected should not exist",
    ],
  ])("rejects invalid registration input", async (input, message) => {
    await expect(validationMessages(input)).resolves.toContain(message);
  });

  it("normalizes email and display name without trimming the password", async () => {
    const password = "  valid password with spaces  ";
    const dto = plainToInstance(RegisterDto, {
      displayName: "  Arthur  ",
      email: "  User@Example.COM ",
      password,
    });

    await expect(validationMessages(dto)).resolves.toEqual([]);
    expect(dto).toMatchObject({
      displayName: "Arthur",
      email: "user@example.com",
      password,
    });
  });
});
