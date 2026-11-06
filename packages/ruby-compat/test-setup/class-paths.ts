import { beforeAll, expect } from "vitest";

type Exports = string | { default?: string } | Record<string, unknown> | undefined;

const SOURCES = import.meta.glob(["../../*/{src,lib}/**/*.ts", "!**/*.test.ts"]);
const TABLES = import.meta.glob("../../*/{src,lib}/constants.generated.ts");
const MANIFESTS = import.meta.glob<{ exports?: Record<string, Exports> | string; main?: string }>(
  "../../*/package.json",
  { eager: true, import: "default" },
);

function libRootOf(pkg: string): "lib" | "src" | undefined {
  if (`../../${pkg}/lib/constants.generated.ts` in TABLES) return "lib";
  if (`../../${pkg}/src/constants.generated.ts` in TABLES) return "src";
  return undefined;
}

function entryOf(pkg: string, root: "lib" | "src"): string | undefined {
  const manifest = MANIFESTS[`../../${pkg}/package.json`];
  const dot = typeof manifest?.exports === "string" ? manifest.exports : manifest?.exports?.["."];
  const target =
    typeof dot === "string" ? dot : ((dot as { default?: string })?.default ?? manifest?.main);
  const file = target?.replace(/^\.?\/?dist\//, "").replace(/\.js$/, ".ts");
  return file === undefined ? undefined : `../../${pkg}/${root}/${file}`;
}

beforeAll(async () => {
  const pkg = expect.getState().testPath?.match(/\/packages\/([^/]+)\/(?:src|test)\//)?.[1];
  const root = pkg === undefined ? undefined : libRootOf(pkg);
  if (pkg === undefined || root === undefined) return;
  const entry = entryOf(pkg, root);
  const load = entry === undefined ? undefined : SOURCES[entry];
  if (load === undefined) throw new Error(`no source entry for ${pkg} (${entry})`);
  await load();
});
