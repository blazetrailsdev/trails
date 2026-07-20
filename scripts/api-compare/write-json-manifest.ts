/**
 * Writes a generated JSON manifest formatted exactly as `prettier --check`
 * expects it.
 *
 * Raw `JSON.stringify(data, null, 2)` is NOT prettier-stable: prettier's JSON
 * printer collapses short arrays onto one line (printWidth 100), so a
 * stringify-emitted manifest re-expands every array and the tracked tree goes
 * dirty the moment anyone regenerates it. Prettier 3 exposes no synchronous
 * format API and these emitters run in a CJS-transpiled script (no top-level
 * await), so we shell out to the repo-local prettier CLI with
 * `--stdin-filepath` — that resolves .prettierrc.json for the target path the
 * same way a normal `prettier --write` would.
 */
import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PRETTIER_BIN = path.join(REPO_ROOT, "node_modules/.bin/prettier");

export function writeJsonManifest(outPath: string, data: unknown): void {
  const raw = JSON.stringify(data, null, 2) + "\n";
  const formatted = execFileSync(PRETTIER_BIN, ["--stdin-filepath", outPath], {
    input: raw,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, formatted);
}
