import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const version = "2.3.0";
const platform = process.platform === "darwin" ? "macos" : process.platform;
const architecture = process.arch === "arm64" ? "arm64" : "amd64";
if (!["macos", "linux"].includes(platform) || !["x64", "arm64"].includes(process.arch)) throw new Error("Unsupported k6 host");
const name = `k6-v${version}-${platform}-${architecture}`;
const filename = `${name}.${platform === "macos" ? "zip" : "tar.gz"}`;
const base = `https://github.com/grafana/k6/releases/download/v${version}`;
async function fetchRelease(path) {
  const response = await fetch(`${base}/${path}`, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`k6 release download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
const [archive, checksums] = await Promise.all([fetchRelease(filename), fetchRelease(`k6-v${version}-checksums.txt`)]);
const expected = checksums.toString().split("\n").find((line) => line.trim().endsWith(` ${filename}`))?.trim().split(/\s+/)[0];
if (!expected || createHash("sha256").update(archive).digest("hex") !== expected) throw new Error("k6 checksum mismatch");
const directory = await mkdtemp(join(tmpdir(), "tripforge-k6-"));
await writeFile(join(directory, filename), archive);
execFileSync(platform === "macos" ? "unzip" : "tar", platform === "macos" ? ["-q", join(directory, filename), "-d", directory] : ["-xzf", join(directory, filename), "-C", directory]);
console.log(join(directory, name, "k6"));
