import { describe, expect, it } from "vitest";

import { isWallClockTime } from "./wall-clock-time.validator";

describe("isWallClockTime", () => {
  it.each(["00:00", "09:05", "18:30", "23:59"])(
    "accepts strict local wall-clock time: %s",
    (value) => expect(isWallClockTime(value)).toBe(true),
  );

  it.each(["24:00", "9:30", "09:60", "09:30:00", "9pm", "", null])(
    "rejects malformed time: %s",
    (value) => expect(isWallClockTime(value)).toBe(false),
  );
});
