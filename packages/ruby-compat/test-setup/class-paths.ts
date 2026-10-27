import { beforeAll, expect } from "vitest";

type Exports = string | { default?: string } | Record<string, unknown> | undefined;

const SOURCES = import.meta.glob(["../../*/src/**/*.ts", "!**/*.test.ts"]);
const TABLES = import.meta.glob("../../*/src/class-paths.generated.ts");
const MANIFESTS = import.meta.glob<{ exports?: Record<string, Exports> | string; main?: string }>(
  "../../*/package.json",
  { eager: true, import: "default" },
);

function entryOf(pkg: string): string | undefined {
  const manifest = MANIFESTS[`../../${pkg}/package.json`];
  const root = typeof manifest?.exports === "string" ? manifest.exports : manifest?.exports?.["."];
  const target =
    typeof root === "string" ? root : ((root as { default?: string })?.default ?? manifest?.main);
  const file = target?.replace(/^\.?\/?dist\//, "").replace(/\.js$/, ".ts");
  return file === undefined ? undefined : `../../${pkg}/src/${file}`;
}

beforeAll(async () => {
  const pkg = expect.getState().testPath?.match(/\/packages\/([^/]+)\/src\//)?.[1];
  if (pkg === undefined || !(`../../${pkg}/src/class-paths.generated.ts` in TABLES)) return;
  const entry = entryOf(pkg);
  const load = entry === undefined ? undefined : SOURCES[entry];
  if (load === undefined) throw new Error(`no source entry for ${pkg} (${entry})`);
  await load();
});
