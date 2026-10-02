import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PATTERNS = [
  {
    name: "AWS access key",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u,
  },
  {
    name: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  },
  {
    name: "raw session token",
    pattern:
      /(?:__Host-tripforge_session|tripforge_session)\s*[:=]\s*["']?[A-Za-z0-9_-]{32,}/u,
  },
  {
    name: "provider secret",
    pattern:
      /(?:OPENROUTESERVICE_API_KEY|LOCALSTACK_AUTH_TOKEN)\s*[:=]\s*["']?(?!process\.env\b|test\b|fake\b|placeholder\b|changeme\b)[A-Za-z0-9_./+=-]{20,}/u,
  },
  {
    name: "OpenAI API key",
    pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/u,
  },
  {
    name: "AWS secret key",
    pattern:
      /AWS_SECRET_ACCESS_KEY\s*[:=]\s*["']?(?!test\b|fake-key\b|placeholder\b|changeme\b)[A-Za-z0-9/+=]{32,}/u,
  },
];

export function scanText(path, source) {
  const findings = [];
  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    for (const { name, pattern } of PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ line: index + 1, name, path });
      }
    }
  }
  return findings;
}

export async function scanRepository(paths) {
  const findings = [];
  for (const path of paths) {
    let content;
    try {
      content = await readFile(path);
    } catch {
      continue;
    }
    if (content.includes(0)) continue;
    findings.push(...scanText(path, content.toString("utf8")));
  }
  return findings;
}

async function main() {
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  const findings = await scanRepository(paths);
  if (findings.length > 0) {
    process.stderr.write("Potential committed secrets found:\n");
    for (const finding of findings) {
      process.stderr.write(
        `- ${finding.path}:${finding.line} (${finding.name})\n`,
      );
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Secret scan passed (${paths.length} tracked/unignored text candidates).\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
