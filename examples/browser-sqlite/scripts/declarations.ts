import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAMES } from "../src/runtime/package-names.ts";

const PACKAGES_DIR = fileURLToPath(new URL("../../../packages/", import.meta.url));
const TS_LIB_DIR = fileURLToPath(new URL("../node_modules/typescript-5/lib/", import.meta.url));

type Manifest = { name: string; dependencies?: Record<string, string> };

async function walk(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${rel}${entry.name}`;
    if (entry.isDirectory()) out.push(...(await walk(`${dir}${entry.name}/`, `${path}/`)));
    else if (path.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

/**
 * The declarations the playground's type checker reads, keyed by the path it
 * sees them at: each `@blazetrails/*` package an app can import, and the
 * workspace packages those depend on, under `/node_modules/`, and
 * TypeScript's lib files under `/lib/`. Built once, at build time.
 */
export async function declarationFiles(): Promise<Record<string, string>> {
  const dirs = new Map<string, string>();
  const manifests = new Map<string, Manifest>();
  for (const dir of await readdir(PACKAGES_DIR)) {
    const text = await readFile(`${PACKAGES_DIR}${dir}/package.json`, "utf8").catch(() => null);
    if (text === null) continue;
    const manifest = JSON.parse(text) as Manifest;
    dirs.set(manifest.name, dir);
    manifests.set(manifest.name, manifest);
  }
  const wanted = PACKAGE_NAMES.map((n) => n.split("/").slice(0, 2).join("/"));
  const seen = new Set<string>();
  while (wanted.length) {
    const name = wanted.pop()!;
    if (seen.has(name) || !dirs.has(name)) continue;
    seen.add(name);
    wanted.push(...Object.keys(manifests.get(name)!.dependencies ?? {}));
  }
  const files: Record<string, string> = {};
  for (const name of seen) {
    const root = `${PACKAGES_DIR}${dirs.get(name)}/`;
    files[`/node_modules/${name}/package.json`] = await readFile(`${root}package.json`, "utf8");
    const dist = await walk(`${root}dist/`).catch(() => []);
    for (const path of dist) {
      files[`/node_modules/${name}/dist/${path}`] = await readFile(`${root}dist/${path}`, "utf8");
    }
  }
  for (const path of await readdir(TS_LIB_DIR)) {
    if (/^lib\..*\.d\.ts$/.test(path))
      files[`/lib/${path}`] = await readFile(`${TS_LIB_DIR}${path}`, "utf8");
  }
  return files;
}
