import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PACKAGES = path.join(REPO_ROOT, "packages");

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("usage: pnpm release:version <major.minor.patch[-pre]>");
  process.exit(1);
}

for (const dir of (await readdir(PACKAGES)).sort()) {
  const file = path.join(PACKAGES, dir, "package.json");
  const source = await readFile(file, "utf8").catch(() => null);
  if (source === null) continue;
  const manifest = JSON.parse(source) as { private?: boolean; version?: string };
  if (manifest.private === true || manifest.version === version) continue;
  manifest.version = version;
  await writeFile(file, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`${dir}: ${version}`);
}
