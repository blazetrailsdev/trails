import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The nightly stats sync runs `pnpm tsx scripts/sync-stats/sync.ts`. tsx picks
// the module format from the nearest package.json, and the repo root declares
// no "type" — so without a local marker sync.ts loads as CommonJS and tsx
// transforms the whole workspace `dist/` graph it imports to CJS as well. That
// graph reaches `@blazetrails/activesupport`'s `dist/yaml.js`, whose top-level
// await cannot be represented in CJS, and esbuild aborts the run with
// "Top-level await is currently not supported with the \"cjs\" output format".
// The crash is invisible to typecheck and to vitest (both ESM), so this is the
// only thing standing between a deleted marker and a silently dead cron.
const dir = fileURLToPath(new URL(".", import.meta.url));

describe("sync-stats module format", () => {
  it("declares ESM so tsx does not CJS-transform the workspace dist graph", async () => {
    const pkg: unknown = JSON.parse(await readFile(`${dir}package.json`, "utf8"));
    expect((pkg as { type?: string }).type).toBe("module");
  });

  it("still imports a workspace package, so the ESM marker is load-bearing", async () => {
    const source = await readFile(`${dir}sync.ts`, "utf8");
    expect(source).toMatch(/from "@blazetrails\//);
  });
});
