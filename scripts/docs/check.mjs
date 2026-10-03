import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export async function checkMarkdown(source, file, root) {
  const errors = [];
  if (/(?:\/Users\/|\/home\/|\/private\/tmp\/|\/var\/folders\/|file:\/\/|[A-Za-z]:\\Users\\)/u.test(source)) errors.push(`${file}: absolute local filesystem path`);
  let fence;
  const prose = source.split("\n").map((line) => {
    const match = line.match(/^\s*(`{3,}|~{3,})(.*)$/u);
    if (match) {
      if (!fence) fence = match[1];
      else if (match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) fence = undefined;
      return "";
    }
    return fence ? "" : line;
  }).join("\n");
  if (fence) errors.push(`${file}: unclosed code fence`);
  const links = [...prose.matchAll(/(!?)\[([^\]]*)\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/gu)]
    .map((match) => ({ image: Boolean(match[1]), alt: match[2], target: match[3].replace(/^<|>$/gu, "") }));
  const references = new Map();
  const referenceKey = (label) => label.trim().replace(/\s+/gu, " ").toLowerCase();
  for (const match of prose.matchAll(/^\s*\[([^\]]+)\]:\s*(<[^>]+>|\S+)/gmu)) {
    const target = match[2].replace(/^<|>$/gu, "");
    references.set(referenceKey(match[1]), target); links.push({ target });
  }
  for (const match of prose.matchAll(/(!?)\[([^\]]*)\]\[([^\]]*)\]/gu)) {
    const target = references.get(referenceKey(match[3] || match[2]));
    if (!target) { errors.push(`${file}: missing reference definition`); continue; }
    links.push({ image: Boolean(match[1]), alt: match[2], target });
  }
  for (const link of links) {
    if (link.image && !link.alt.trim()) errors.push(`${file}: image needs meaningful alt text`);
    if (/^(?:https?:|mailto:|tel:)/iu.test(link.target) || link.target.startsWith("#")) continue;
    let target;
    try { target = decodeURIComponent(link.target.split(/[?#]/u)[0]); } catch { errors.push(`${file}: invalid link encoding`); continue; }
    if (!target) continue;
    const destination = resolve(target.startsWith("/") ? root : dirname(resolve(root, file)), target.replace(/^\//u, ""));
    const rel = relative(root, destination);
    if (rel.startsWith(`..${sep}`) || rel === "..") { errors.push(`${file}: link escapes repository`); continue; }
    try {
      const info = await stat(destination);
      if (link.image && !info.isFile()) errors.push(`${file}: image is not a file: ${target}`);
      if (link.image && destination.includes(`${sep}docs${sep}assets${sep}portfolio${sep}`) && info.size > 1_000_000) errors.push(`${file}: portfolio image exceeds 1 MB: ${target}`);
    } catch { errors.push(`${file}: missing relative target: ${target}`); }
  }
  return errors;
}

export async function checkRepository(root) {
  const files = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter((file) => file.endsWith(".md")))].sort();
  const errors = [];
  for (const file of files) errors.push(...await checkMarkdown(await readFile(resolve(root, file), "utf8"), file, root));
  return { files, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const { files, errors } = await checkRepository(root);
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
  else console.log(`Documentation check passed: ${files.length} Markdown files; local links/images, path privacy, fences and image-size bounds. No network requests.`);
}
