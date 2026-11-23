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

const [, major, minor, tiny, pre] = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(version)!;
const gemVersionFile = path.join(PACKAGES, "trailties", "lib", "gem-version.ts");
await writeFile(
  gemVersionFile,
  (await readFile(gemVersionFile, "utf8"))
    .replace(/^const MAJOR = .*;$/m, `const MAJOR = ${major};`)
    .replace(/^const MINOR = .*;$/m, `const MINOR = ${minor};`)
    .replace(/^const TINY = .*;$/m, `const TINY = ${tiny};`)
    .replace(
      /^const PRE: string \| null = .*;$/m,
      `const PRE: string | null = ${pre === undefined ? "null" : JSON.stringify(pre)};`,
    ),
);
