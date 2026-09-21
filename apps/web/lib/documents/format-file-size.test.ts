import { describe, expect, it } from "vitest";

import { formatFileSize } from "./format-file-size";

describe("formatFileSize", () => {
  it.each([
    [834, "834 B"],
    [42 * 1024, "42 KB"],
    [2.4 * 1024 * 1024, "2.4 MB"],
    [25 * 1024 * 1024, "25 MB"],
  ])("formats %s bytes with binary units", (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});
