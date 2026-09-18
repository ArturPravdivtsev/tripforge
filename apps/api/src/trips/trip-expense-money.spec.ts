import {
  allocateEqualSplit,
  formatMinorAmount,
  getCurrencyMinorUnitDigits,
  minorAmountToMajorString,
  parseMajorAmountToMinor,
} from "@tripforge/contracts";
import { describe, expect, it } from "vitest";

describe("expense money helpers", () => {
  it("reads runtime currency exponents", () => {
    expect(getCurrencyMinorUnitDigits("EUR")).toBe(2);
    expect(getCurrencyMinorUnitDigits("JPY")).toBe(0);
    expect(getCurrencyMinorUnitDigits("KWD")).toBe(3);
  });

  it.each([
    ["12", "EUR", 1200],
    ["12.5", "EUR", 1250],
    ["12.50", "EUR", 1250],
    ["1200", "JPY", 1200],
    ["1.234", "KWD", 1234],
  ])("parses %s %s as exact minor units", (value, currency, expected) => {
    expect(parseMajorAmountToMinor(value, currency)).toBe(expected);
  });

  it.each([
    ["12.500", "EUR"],
    ["1200.5", "JPY"],
    ["-1", "EUR"],
    ["1e3", "EUR"],
    ["NaN", "EUR"],
    ["Infinity", "EUR"],
    ["", "EUR"],
    ["1.2.3", "EUR"],
  ])("rejects invalid major amount %s %s", (value, currency) => {
    expect(parseMajorAmountToMinor(value, currency)).toBeNull();
  });

  it("rejects values above the JavaScript safe integer range", () => {
    expect(parseMajorAmountToMinor("90071992547409.92", "EUR")).toBeNull();
  });

  it("allocates equal-split remainders by sorted user id", () => {
    expect(allocateEqualSplit(100, ["c", "a", "b"])).toEqual([
      { amountMinor: 34, userId: "a" },
      { amountMinor: 33, userId: "b" },
      { amountMinor: 33, userId: "c" },
    ]);
  });

  it("formats and restores zero-, two- and three-decimal currencies", () => {
    expect(minorAmountToMajorString(1250, "EUR")).toBe("12.50");
    expect(minorAmountToMajorString(1200, "JPY")).toBe("1200");
    expect(minorAmountToMajorString(1234, "KWD")).toBe("1.234");
    expect(formatMinorAmount(1250, "EUR", "en")).toContain("12.50");
    expect(formatMinorAmount(1200, "JPY", "en")).toContain("1,200");
  });
});
