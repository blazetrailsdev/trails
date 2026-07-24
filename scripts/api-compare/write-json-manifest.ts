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
 * error there), so we shell out to the repo-local prettier CLI. The raw
 * stringify is written to disk first, then prettier is invoked with `--write`
 * over the on-disk path(s); `--write` resolves .prettierrc.json for each target
 * path exactly as it would for a hand-run format. Async emitters share this
 * same helper on purpose: one formatting code path means the manifests cannot
 * drift apart from each other.
 *
 * Batching: prettier startup is ~330ms, dwarfing the format work, so an emitter
 * that produces several manifests can wrap its writes in
 * `beginManifestBatch()` / `flushManifestBatch()` to collect the paths and
 * format them all in a single `prettier --write path…` spawn. Outside a batch,
 * each write formats immediately.
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

// `prettier --write` consults --ignore-path (default: .gitignore AND
// .prettierignore) and, for a matched path, leaves the file UNFORMATTED and
// exits 0 — a silent no-op, not an error. Several manifests are gitignored and
// one was .prettierignore'd, so without this bypass the helper would quietly
// do nothing for them and the churn trap would stay armed. Emitted manifests
// are always formatted, regardless of what ignores them elsewhere.
const IGNORE_BYPASS = ["--ignore-path", "/dev/null"];

// When non-null, an open batch collects paths instead of formatting each write.
let openBatch: string[] | null = null;

function runPrettier(paths: string[]): void {
  if (paths.length === 0) return;
  try {
    execFileSync(PRETTIER_BIN, IGNORE_BYPASS.concat("--write", ...paths), {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(
      `[write-json-manifest] prettier failed formatting ${paths.join(", ")}. ` +
        `Manifests must be emitted prettier-formatted or the tree goes dirty on every ` +
        `regeneration; refusing to leave unformatted output. Is ${PRETTIER_BIN} present ` +
        `(\`pnpm install\`)?`,
      { cause: err },
    );
  }
}

export function writeJsonManifest(outPath: string, data: unknown): void {
  const raw = JSON.stringify(data, null, 2) + "\n";
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, raw);
  if (openBatch) openBatch.push(outPath);
  else runPrettier([outPath]);
}

/**
 * Opens a batch: subsequent `writeJsonManifest` calls write their raw bytes but
 * defer formatting until `flushManifestBatch()`, which formats every collected
 * path in one prettier spawn. Idempotent — a second call while a batch is open
 * is a no-op, so nested callers can't clobber the outer batch.
 */
export function beginManifestBatch(): void {
  if (!openBatch) openBatch = [];
}

/** Formats every path collected since `beginManifestBatch()` in one spawn. */
export function flushManifestBatch(): void {
  const paths = openBatch;
  openBatch = null;
  if (paths) runPrettier(paths);
}
