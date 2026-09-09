import { describe, expect, it } from "vitest";

import {
  getSessionCookieConfiguration,
  SESSION_LIFETIME_MS,
} from "./session-cookie";

describe("getSessionCookieConfiguration", () => {
  it("supports local HTTP in development and test", () => {
    for (const environment of ["development", "test"]) {
      expect(getSessionCookieConfiguration(environment)).toEqual({
        name: "tripforge_session",
        options: {
          httpOnly: true,
          maxAge: SESSION_LIFETIME_MS,
          path: "/",
          sameSite: "lax",
          secure: false,
        },
      });
    }
  });

  it("uses a host-bound secure cookie in production", () => {
    const configuration = getSessionCookieConfiguration("production");

    expect(configuration).toEqual({
      name: "__Host-tripforge_session",
      options: {
        httpOnly: true,
        maxAge: SESSION_LIFETIME_MS,
        path: "/",
        sameSite: "lax",
        secure: true,
      },
    });
    expect(configuration.options).not.toHaveProperty("domain");
  });
});
