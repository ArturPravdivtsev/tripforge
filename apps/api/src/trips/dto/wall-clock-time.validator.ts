import { ValidateBy, type ValidationOptions } from "class-validator";

const WALL_CLOCK_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isWallClockTime(value: unknown): value is string {
  return typeof value === "string" && WALL_CLOCK_TIME_PATTERN.test(value);
}

export function IsWallClockTime(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: "isWallClockTime",
      validator: {
        defaultMessage: () =>
          "$property must be a valid 24-hour time in HH:mm format",
        validate: isWallClockTime,
      },
    },
    validationOptions,
  );
}
