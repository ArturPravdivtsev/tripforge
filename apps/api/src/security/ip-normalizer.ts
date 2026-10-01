import { isIP } from "node:net";

const IPV4_MAPPED_PREFIX = "::ffff:";

export function normalizeClientIp(value: string | undefined): string {
  const withoutZone = value?.trim().toLowerCase().split("%", 1)[0];
  if (!withoutZone) return "unknown";

  if (withoutZone.startsWith(IPV4_MAPPED_PREFIX)) {
    const mapped = withoutZone.slice(IPV4_MAPPED_PREFIX.length);
    if (isIP(mapped) === 4) return mapped;
  }

  if (isIP(withoutZone) === 4) return withoutZone;
  if (isIP(withoutZone) !== 6) return "unknown";

  const groups = expandIpv6(withoutZone);
  return groups ? `${groups.slice(0, 4).join(":")}::/64` : "unknown";
}

function expandIpv6(value: string): string[] | undefined {
  const halves = value.split("::");
  if (halves.length > 2) return undefined;

  const left = ipv6Groups(halves[0] ?? "");
  const right = ipv6Groups(halves[1] ?? "");
  if (!left || !right) return undefined;

  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return undefined;

  return [
    ...left,
    ...Array.from({ length: missing }, () => "0000"),
    ...right,
  ].map((group) => group.padStart(4, "0"));
}

function ipv6Groups(value: string): string[] | undefined {
  if (!value) return [];
  const groups = value.split(":");
  const last = groups.at(-1);
  if (last && isIP(last) === 4) {
    const octets = last.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => octet < 0 || octet > 255)) {
      return undefined;
    }
    groups.splice(
      -1,
      1,
      ((octets[0] ?? 0) * 256 + (octets[1] ?? 0)).toString(16),
      ((octets[2] ?? 0) * 256 + (octets[3] ?? 0)).toString(16),
    );
  }
  return groups.every((group) => /^[0-9a-f]{1,4}$/u.test(group))
    ? groups
    : undefined;
}
