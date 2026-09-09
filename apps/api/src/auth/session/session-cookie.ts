export const SESSION_LIFETIME_DAYS = 30;
export const SESSION_LIFETIME_MS =
  SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1_000;

const DEVELOPMENT_COOKIE_NAME = "tripforge_session";
const PRODUCTION_COOKIE_NAME = "__Host-tripforge_session";

export type SessionCookieOptions = {
  httpOnly: true;
  maxAge: number;
  path: "/";
  sameSite: "lax";
  secure: boolean;
};

export type SessionCookieConfiguration = {
  name: string;
  options: SessionCookieOptions;
};

export function getSessionCookieConfiguration(
  nodeEnvironment: string,
): SessionCookieConfiguration {
  const production = nodeEnvironment === "production";

  return {
    name: production ? PRODUCTION_COOKIE_NAME : DEVELOPMENT_COOKIE_NAME,
    options: {
      httpOnly: true,
      maxAge: SESSION_LIFETIME_MS,
      path: "/",
      sameSite: "lax",
      secure: production,
    },
  };
}
