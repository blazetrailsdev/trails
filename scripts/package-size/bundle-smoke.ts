import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { REPO_ROOT } from "./side-effects.js";

/**
 * Runtime smoke for the `sideEffects` declarations (RFC 0100,
 * `accurate-side-effects-declarations`): an app bundled with `--minify` still
 * connects, migrates, and round-trips a record with an association and an enum.
 * A blanket `sideEffects: false` on activerecord fails here with `LoadError`.
 * `keepNames` is required of any bundled trails app, as table names and visitor
 * dispatch read class names. Needs `pnpm build` first.
 */
async function main(): Promise<void> {
  const dir = await mkdtemp(path.join(REPO_ROOT, "packages", "activerecord", ".bundle-smoke-"));
  try {
    const outfile = path.join(dir, "app.mjs");
    await build({
      entryPoints: [path.join(import.meta.dirname, "__fixtures__", "smoke-app.ts")],
      absWorkingDir: path.join(REPO_ROOT, "packages", "activerecord"),
      bundle: true,
      minify: true,
      keepNames: true,
      platform: "node",
      format: "esm",
      external: ["better-sqlite3"],
      banner: {
        js: "import { createRequire as __cr } from 'node:module';const require=__cr(import.meta.url);",
      },
      outfile,
      logLevel: "silent",
    });
    const { stdout } = await promisify(execFile)(process.execPath, [outfile]);
    const got = stdout.trim().split("\n").at(-1);
    const want = JSON.stringify({
      title: "The Dispossessed",
      status: "published",
      author: "Ursula",
    });
    if (got !== want) throw new Error(`bundled app printed ${got}, expected ${want}`);
    console.log("bundle smoke: ok");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
