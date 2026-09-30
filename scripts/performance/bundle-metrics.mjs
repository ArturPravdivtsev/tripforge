import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export async function collectBundleMetrics(nextDirectory) {
  const staticDirectory = path.join(nextDirectory, "static");
  const staticFiles = await listFiles(staticDirectory);
  const javascriptFiles = await measureFiles(
    staticFiles.filter((file) => file.endsWith(".js")),
    nextDirectory,
  );
  const cssFiles = await measureFiles(
    staticFiles.filter((file) => file.endsWith(".css")),
    nextDirectory,
  );
  const buildManifest = await readJson(
    path.join(nextDirectory, "build-manifest.json"),
  );
  const routeManifests = await loadRouteManifests(
    path.join(nextDirectory, "server", "app"),
  );
  const rootFiles = new Set(buildManifest.rootMainFiles ?? []);
  const routes = Object.fromEntries(
    routeManifests.map(({ manifest, route }) => {
      const files = new Set(rootFiles);
      const cssReferences = new Set();
      for (const module of Object.values(manifest.clientModules ?? {})) {
        for (const chunk of module.chunks ?? []) {
          if (typeof chunk === "string" && chunk.endsWith(".js")) {
            files.add(chunk);
          }
        }
      }
      for (const entries of Object.values(manifest.entryCSSFiles ?? {})) {
        for (const entry of entries) cssReferences.add(entry.path);
      }
      return [
        route,
        {
          ...summarizeReferencedFiles(files, javascriptFiles),
          css: summarizeReferencedFiles(cssReferences, cssFiles),
        },
      ];
    }),
  );
  const loadableManifest = await readJson(
    path.join(nextDirectory, "react-loadable-manifest.json"),
  );
  const mapLazyFiles = new Set(
    Object.entries(loadableManifest)
      .filter(([key]) => key.includes("trip-map"))
      .flatMap(([, entry]) => entry.files ?? [])
  );
  const nonMapRoutes = ["/login", "/register", "/notifications", "/trips"];
  const sharedInitialFiles = intersectSets(
    Object.values(routes).map(({ files }) => new Set(files)),
  );

  return {
    css: summarizeMeasuredFiles(cssFiles),
    javascript: summarizeMeasuredFiles(javascriptFiles),
    largestCssFiles: largest(cssFiles),
    largestJavaScriptFiles: largest(javascriptFiles),
    mapLazy: summarizeReferencedFiles(mapLazyFiles, javascriptFiles),
    mapLazyCss: summarizeReferencedFiles(mapLazyFiles, cssFiles),
    mapLeakRoutes: nonMapRoutes.filter((route) =>
      routes[route]?.files.some((file) => mapLazyFiles.has(file)),
    ),
    nonMapRouteMaxInitialBytes: Math.max(
      ...nonMapRoutes.map((route) => routes[route]?.rawBytes ?? 0),
    ),
    nonMapRouteMaxInitialCssBytes: Math.max(
      ...nonMapRoutes.map((route) => routes[route]?.css.rawBytes ?? 0),
    ),
    routes,
    sharedInitial: summarizeReferencedFiles(sharedInitialFiles, javascriptFiles),
    sharedInitialCss: summarizeReferencedFiles(
      intersectSets(
        Object.values(routes).map(({ css }) => new Set(css.files)),
      ),
      cssFiles,
    ),
  };
}

export function parseClientReferenceManifest(source) {
  const assignment = source.match(/__RSC_MANIFEST\["[^"]+"\]=/);
  if (assignment?.index === undefined) {
    throw new Error("Invalid client reference manifest");
  }
  const json = source
    .slice(assignment.index + assignment[0].length)
    .trim()
    .replace(/;$/, "");
  return JSON.parse(json);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(target) : [target];
    }),
  );
  return nested.flat();
}

async function loadRouteManifests(appDirectory) {
  const files = (await listFiles(appDirectory)).filter((file) =>
    file.endsWith("page_client-reference-manifest.js"),
  );
  return Promise.all(
    files.map(async (file) => {
      const source = await readFile(file, "utf8");
      const routeMatch = source.match(/__RSC_MANIFEST\["([^"]+)"\]/);
      if (!routeMatch) throw new Error(`Route missing from ${file}`);
      return {
        manifest: parseClientReferenceManifest(source),
        route: routeMatch[1].replace(/\/page$/, "") || "/",
      };
    }),
  );
}

async function measureFiles(files, nextDirectory) {
  const entries = await Promise.all(
    files.map(async (file) => {
      const content = await readFile(file);
      const relative = path.relative(nextDirectory, file);
      return [
        relative,
        {
          brotliBytes: brotliCompressSync(content, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
          }).byteLength,
          gzipBytes: gzipSync(content, { level: 9 }).byteLength,
          rawBytes: (await stat(file)).size,
        },
      ];
    }),
  );
  return new Map(entries);
}

function summarizeMeasuredFiles(files) {
  return [...files.values()].reduce(
    (summary, file) => ({
      brotliBytes: summary.brotliBytes + file.brotliBytes,
      fileCount: summary.fileCount + 1,
      gzipBytes: summary.gzipBytes + file.gzipBytes,
      rawBytes: summary.rawBytes + file.rawBytes,
    }),
    { brotliBytes: 0, fileCount: 0, gzipBytes: 0, rawBytes: 0 },
  );
}

function summarizeReferencedFiles(references, measuredFiles) {
  const files = [...references].filter((file) => measuredFiles.has(file)).sort();
  const summary = summarizeMeasuredFiles(
    new Map(files.map((file) => [file, measuredFiles.get(file)])),
  );
  return { ...summary, files };
}

function intersectSets(sets) {
  if (sets.length === 0) return new Set();
  return new Set([...sets[0]].filter((value) => sets.every((set) => set.has(value))));
}

function largest(files, limit = 10) {
  return [...files.entries()]
    .map(([file, sizes]) => ({ file, ...sizes }))
    .sort((left, right) => right.rawBytes - left.rawBytes)
    .slice(0, limit);
}
