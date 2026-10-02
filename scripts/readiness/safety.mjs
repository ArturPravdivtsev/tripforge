export const profiles = {
  smoke: { vus: 2, duration: "1m" },
  load: { vus: 20, duration: "10m" },
  stress: { stages: [25, 50, 75, 100].map((target) => ({ target, duration: "2m" })) },
  soak: { vus: 20, duration: "30m" },
};

export function assertLocalTarget(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Disposable loopback origin required; remote/production targets refused");
  }
  return url.origin;
}

export function assertProfile(mode, duration, vus) {
  if (!Object.hasOwn(profiles, mode)) throw new Error("Mode must be smoke, load, stress or soak");
  if (duration !== undefined && !/^[1-9]\d*(s|m|h)$/.test(duration)) throw new Error("Invalid duration");
  if (duration !== undefined && Number(duration.slice(0, -1)) * ({ s: 1, m: 60, h: 3600 })[duration.at(-1)] > 3600) throw new Error("Disposable local duration must not exceed one hour");
  if (vus !== undefined && (!Number.isInteger(Number(vus)) || Number(vus) < 1 || Number(vus) > 100)) throw new Error("VU count must be 1..100");
}

export function destructiveStatements(sql) {
  // Conservative static review gate, not an SQL parser. Dollar-quoted functions
  // stay visible so dynamic destructive statements are not silently exempted.
  const clean = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  return clean.split(";").map((part) => part.trim()).filter((part) =>
    /\b(?:DROP\s+(?:TABLE|COLUMN|SCHEMA|DATABASE|TYPE|INDEX)|TRUNCATE\b|DELETE\s+FROM\b|ALTER\s+COLUMN\b[^;]*\bTYPE\b|SET\s+NOT\s+NULL\b|RENAME\s+(?:COLUMN|TO)\b)/i.test(part));
}
