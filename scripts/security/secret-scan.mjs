import { execFileSync, spawnSync } from "node:child_process";
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
    name: "GitHub token",
    pattern: /\b(?:gh[opsur]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/u,
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

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed with status ${result.status}`);
  }
  return result.stdout;
}

export function scanHistory(cwd = process.cwd()) {
  const reachable = git(["rev-list", "--objects", "--all"], { cwd });
  const pathByObject = new Map();
  for (const line of reachable.split("\n")) {
    const [object, ...pathParts] = line.trim().split(" ");
    if (object && !pathByObject.has(object)) {
      pathByObject.set(object, pathParts.join(" ") || "(path unavailable)");
    }
  }

  const objectIds = [...pathByObject.keys()];
  if (objectIds.length === 0) return { blobs: 0, findings: [] };
  const metadata = git(
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    { cwd, input: `${objectIds.join("\n")}\n` },
  );
  const findings = [];
  let blobs = 0;

  for (const line of metadata.trim().split("\n")) {
    const [object, type, sizeText] = line.split(" ");
    const size = Number(sizeText);
    if (type !== "blob" || !Number.isSafeInteger(size) || size > 10_000_000) continue;
    const content = execFileSync("git", ["cat-file", "blob", object], {
      cwd,
      maxBuffer: 10_000_001,
    });
    if (content.includes(0)) continue;
    blobs += 1;
    for (const finding of scanText(pathByObject.get(object), content.toString("utf8"))) {
      findings.push({ ...finding, object });
    }
  }

  return { blobs, findings };
}

async function main() {
  if (process.argv.includes("--history")) {
    const { blobs, findings } = scanHistory();
    if (findings.length > 0) {
      process.stderr.write("Potential secrets found in reachable Git history:\n");
      for (const finding of findings) {
        process.stderr.write(
          `- ${finding.object} ${finding.path}:${finding.line} (${finding.name})\n`,
        );
      }
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `Git-history secret scan passed (${blobs} reachable text blob candidates).\n`,
    );
    return;
  }
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
