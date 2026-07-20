/**
 * Writes a generated JSON manifest formatted exactly as `prettier --check`
 * expects it.
 *
 * Raw `JSON.stringify(data, null, 2)` is NOT prettier-stable: prettier's JSON
 * printer collapses short arrays onto one line (printWidth 100), so a
 * stringify-emitted manifest re-expands every array and the tracked tree goes
 * dirty the moment anyone runs `pnpm lint` or `pnpm api:compare`.
 *
 * Prettier 3 exposes no synchronous format API, and the emitters that call
 * this are transpiled to CJS by tsx (top-level `await` is a hard esbuild
 * error there), so we shell out to the repo-local prettier CLI with
 * `--stdin-filepath` — that resolves .prettierrc.json for the target path the
 * same way `prettier --write` would. Async emitters call this same sync
 * helper on purpose: one formatting code path means the manifests cannot
 * drift apart from each other.
 *
 * Every call reformats unconditionally rather than short-circuiting on
 * unchanged data: a manifest already churned by an older generator must be
 * repaired, not skipped over.
 */
import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PRETTIER_BIN = path.join(REPO_ROOT, "node_modules/.bin/prettier");

export function writeJsonManifest(outPath: string, data: unknown): void {
  const raw = JSON.stringify(data, null, 2) + "\n";
  let formatted: string;
  try {
    formatted = execFileSync(PRETTIER_BIN, ["--stdin-filepath", outPath], {
      input: raw,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(
      `[write-json-manifest] prettier failed formatting ${outPath}. ` +
        `Manifests must be emitted prettier-formatted or the tree goes dirty on every ` +
        `regeneration; refusing to write unformatted output. Is ${PRETTIER_BIN} present ` +
        `(\`pnpm install\`)?`,
      { cause: err },
    );
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, formatted);
}
