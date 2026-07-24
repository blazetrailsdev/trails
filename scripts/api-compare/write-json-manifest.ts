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
 * error there), so we shell out to the repo-local prettier CLI. Because
 * `--write` operates on files, each manifest is staged to a sibling temp file
 * (same directory, `.json` extension, so prettier resolves the identical
 * .prettierrc.json and JSON parser as it would for the real path), formatted
 * there, and only then renamed over the tracked path. The tracked manifest is
 * therefore never touched until prettier has succeeded: a failed spawn unlinks
 * the temp and leaves the committed bytes intact, rather than churning them.
 * Async emitters share this same helper on purpose: one formatting code path
 * means the manifests cannot drift apart from each other.
 *
 * Batching: prettier startup is ~330ms, dwarfing the format work, so an emitter
 * that produces several manifests can wrap its writes in
 * `beginManifestBatch()` / `flushManifestBatch()`. Inside a batch the raw bytes
 * are buffered in memory — nothing hits disk — until the flush stages every
 * temp, formats them in a single `prettier --write path…` spawn, and renames
 * them all into place. A batch abandoned by an exception before its flush thus
 * leaves the tracked manifests entirely untouched, not half-churned.
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

interface PendingWrite {
  outPath: string;
  raw: string;
}

// When non-null, an open batch buffers writes in memory instead of committing
// each one; flushManifestBatch() commits them all in a single prettier spawn.
let openBatch: PendingWrite[] | null = null;

// Disambiguates concurrent temp files (tests emit several manifests from one
// process); the .json extension keeps prettier's parser + config resolution
// identical to the real target.
let tempSeq = 0;
function tempPathFor(outPath: string): string {
  return `${outPath}.${(tempSeq += 1)}.tmp.json`;
}

// Stage each write to a sibling temp, format every temp in one spawn, then
// rename them over their targets. On failure no target is touched — the temps
// are unlinked and the error is surfaced.
function commit(writes: PendingWrite[]): void {
  if (writes.length === 0) return;
  const staged = writes.map((w) => {
    fs.mkdirSync(path.dirname(w.outPath), { recursive: true });
    const tmp = tempPathFor(w.outPath);
    fs.writeFileSync(tmp, w.raw);
    return { tmp, outPath: w.outPath };
  });
  try {
    execFileSync(PRETTIER_BIN, IGNORE_BYPASS.concat("--write", ...staged.map((s) => s.tmp)), {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    for (const s of staged) fs.rmSync(s.tmp, { force: true });
    throw new Error(
      `[write-json-manifest] prettier failed formatting ${writes.map((w) => w.outPath).join(", ")}. ` +
        `Manifests must be emitted prettier-formatted or the tree goes dirty on every ` +
        `regeneration; refusing to write unformatted output. Is ${PRETTIER_BIN} present ` +
        `(\`pnpm install\`)?`,
      { cause: err },
    );
  }
  for (const s of staged) fs.renameSync(s.tmp, s.outPath);
}

export function writeJsonManifest(outPath: string, data: unknown): void {
  const write: PendingWrite = { outPath, raw: JSON.stringify(data, null, 2) + "\n" };
  if (openBatch) openBatch.push(write);
  else commit([write]);
}

/**
 * Opens a batch: subsequent `writeJsonManifest` calls buffer their bytes in
 * memory until `flushManifestBatch()` formats and commits them in one prettier
 * spawn. Idempotent — a second call while a batch is open is a no-op, so nested
 * callers can't clobber the outer batch.
 */
export function beginManifestBatch(): void {
  if (!openBatch) openBatch = [];
}

/** Commits every write buffered since `beginManifestBatch()` in one spawn. */
export function flushManifestBatch(): void {
  const writes = openBatch;
  openBatch = null;
  if (writes) commit(writes);
}
