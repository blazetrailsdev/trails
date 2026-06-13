#!/usr/bin/env tsx
// trails-side CLI for the sibling blazetrailsdev/tasks repo.
//
// All state lives in $TASKS_DIR (default ~/github/blazetrailsdev/tasks).
// Mutations: `git pull --rebase` → frontmatter edit → `git commit` →
// **synchronous** `git push` with one retry on non-fast-forward. The
// retry pulls, re-applies the edit, and pushes again; if it fails a
// second time the caller is told to pick another story.
//
// Read paths consume $TASKS_DIR/index.json, a gitignored cache rebuilt on
// demand: if the file is missing or any story `.md` is newer than
// index.json, this script invokes the tasks-side build-index.mjs to
// regenerate it.
//
// Implementation note: RFC 0001 originally specified SQLite for the
// index. JSON was sufficient for the current scale and avoids a binary
// schema migration cost. If we hit dep-graph queries the JSON+JS shape
// can't handle, switch in a follow-up.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

// $TASKS_DIR is the canonical override; $RFCS_DIR is honored as a
// transition fallback after the rfcs → tasks repo rename.
// Treat empty/whitespace-only env vars as unset so `TASKS_DIR=` doesn't
// silently resolve to cwd via `git -C ""`.
const envDir = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

// Resolution order:
//   1. $TASKS_DIR env var (explicit user override)
//   2. $RFCS_DIR env var (transition fallback)
//   3. <cwd>/tasks if that directory has a .git entry (per-worktree symlink
//      created by start-worktree.sh)
//   4. ~/github/blazetrailsdev/tasks (canonical fallback)
export function resolveTasksDir(cwd = process.cwd()): string {
  const explicit = envDir(process.env.TASKS_DIR) ?? envDir(process.env.RFCS_DIR);
  if (explicit) return explicit;
  const local = join(cwd, "tasks");
  if (existsSync(join(local, ".git"))) return local;
  return join(homedir(), "github", "blazetrailsdev", "tasks");
}

export const TASKS_DIR = resolveTasksDir();

// True when TASKS_DIR resolved to the per-worktree symlink (not from env
// var and not the canonical fallback). Read commands sync from origin/main
// before loading the index so a per-worktree checkout never serves stale data.
const TASKS_DIR_IS_SYMLINK =
  TASKS_DIR !== join(homedir(), "github", "blazetrailsdev", "tasks") &&
  !envDir(process.env.TASKS_DIR) &&
  !envDir(process.env.RFCS_DIR);

export type StoryStatus = "draft" | "ready" | "claimed" | "in-progress" | "done" | "blocked";
export type RfcStatus = "draft" | "active" | "closed" | "postponed" | "superseded";
export const STORY_STATUSES: readonly StoryStatus[] = [
  "draft",
  "ready",
  "claimed",
  "in-progress",
  "done",
  "blocked",
];
export const RFC_STATUSES: readonly RfcStatus[] = [
  "draft",
  "active",
  "closed",
  "postponed",
  "superseded",
];

export interface RfcEntry {
  id: string;
  title: string | null;
  status: RfcStatus | null;
  owner: string | null;
  packages: string[];
  clusters: string[];
  file_path: string;
}
export interface StoryEntry {
  id: string;
  rfc: string;
  title: string | null;
  status: StoryStatus | null;
  cluster: string | null;
  deps: string[];
  deps_rfc: string[];
  est_loc: number | null;
  updated: string | null;
  pr: number | null;
  priority: number | null;
  claim: string | null;
  assignee: string | null;
  blocked_by: string | null;
  file_path: string;
}
export interface Index {
  generated_at: string;
  rfcs: RfcEntry[];
  stories: StoryEntry[];
}

// ──────────────────── index loading ────────────────────

export function loadIndex(): Index {
  const indexPath = join(TASKS_DIR, "index.json");
  if (!existsSync(indexPath) || isIndexStale(indexPath)) {
    // Use `process.execPath` (absolute path to the running Node binary)
    // rather than a bare "node": under pnpm/tsx the spawned environment's
    // PATH may not include `node`, which made the stale-index rebuild fail
    // with `spawnSync node ENOENT`.
    execFileSync(process.execPath, ["scripts/build-index.mjs"], {
      cwd: TASKS_DIR,
      stdio: "inherit",
    });
  }
  return JSON.parse(readFileSync(indexPath, "utf8")) as Index;
}

function isIndexStale(indexPath: string): boolean {
  const indexMtime = statSync(indexPath).mtimeMs;
  for (const rfcDir of readdirSync(TASKS_DIR)) {
    if (!/^\d{4}-/.test(rfcDir)) continue;
    // The RFC README's frontmatter feeds the index too (status, clusters,
    // packages, owner — and clusters drive `deps_rfc` resolution). A
    // README edit without a story touch must invalidate the cache.
    try {
      if (statSync(join(TASKS_DIR, rfcDir, "README.md")).mtimeMs > indexMtime) return true;
    } catch {
      /* missing README — validate step will catch */
    }
    const storiesDir = join(TASKS_DIR, rfcDir, "stories");
    let entries: string[];
    try {
      entries = readdirSync(storiesDir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      if (statSync(join(storiesDir, name)).mtimeMs > indexMtime) return true;
    }
  }
  return false;
}

// ──────────────────── pure queries ────────────────────

export function ready(index: Index, opts: { rfc?: string } = {}): StoryEntry[] {
  const rfcStatus = new Map(index.rfcs.map((r) => [r.id, r.status]));
  const storyStatus = new Map(index.stories.map((s) => [s.id, s.status]));
  return index.stories.filter((s) => {
    if (s.status !== "ready") return false;
    if (opts.rfc && s.rfc !== opts.rfc) return false;
    if (s.deps.some((d) => storyStatus.get(d) !== "done")) return false;
    if (s.deps_rfc.some((d) => rfcStatus.get(d) !== "closed")) return false;
    return true;
  });
}

// 0/1 knapsack: max total est_loc within budget. N ≤ a few dozen in
// practice; O(N·budget) is trivially fast.
export function bestBundle(items: StoryEntry[], budget: number): StoryEntry[] {
  const n = items.length;
  if (n === 0 || budget <= 0) return [];
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(budget + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    const cost = items[i - 1].est_loc ?? 0;
    for (let b = 0; b <= budget; b++) {
      dp[i][b] = dp[i - 1][b];
      if (cost > 0 && cost <= b) {
        dp[i][b] = Math.max(dp[i][b], dp[i - 1][b - cost] + cost);
      }
    }
  }
  const chosen: StoryEntry[] = [];
  let b = budget;
  for (let i = n; i >= 1; i--) {
    if (dp[i][b] !== dp[i - 1][b]) {
      chosen.push(items[i - 1]);
      b -= items[i - 1].est_loc ?? 0;
    }
  }
  return chosen.reverse();
}

export function nextBundle(
  index: Index,
  opts: { maxLoc: number; cluster?: string; rfc?: string },
): StoryEntry[] {
  const candidates = ready(index, { rfc: opts.rfc })
    .filter((s) => s.est_loc !== null)
    .filter((s) => (opts.cluster ? s.cluster === opts.cluster : true));
  // Use Map<string | null, ...> so `null` (unclustered) stays distinct
  // from any real cluster name, even one literally called "_none".
  const byCluster = new Map<string | null, StoryEntry[]>();
  for (const s of candidates) {
    const bucket = byCluster.get(s.cluster) ?? [];
    bucket.push(s);
    byCluster.set(s.cluster, bucket);
  }
  let best: StoryEntry[] = [];
  let bestTotal = 0;
  for (const group of byCluster.values()) {
    const subset = bestBundle(group, opts.maxLoc);
    const total = subset.reduce((a, s) => a + (s.est_loc ?? 0), 0);
    if (total > bestTotal) {
      best = subset;
      bestTotal = total;
    }
  }
  return best;
}

export function listFiltered(
  index: Index,
  opts: { rfc?: string; status?: string; cluster?: string } = {},
): StoryEntry[] {
  return index.stories.filter((s) => {
    if (opts.rfc && s.rfc !== opts.rfc) return false;
    if (opts.status && s.status !== opts.status) return false;
    if (opts.cluster && s.cluster !== opts.cluster) return false;
    return true;
  });
}

// ──────────────────── mutations ────────────────────

// Today's date (UTC, YYYY-MM-DD) for the `updated:` frontmatter stamp. Every
// mutation that writes a story file stamps this so the backlog page can show
// staleness; build-index passes `updated` through to index.json verbatim, so
// the index stays deterministic (the wall-clock read happens here, at edit
// time, not at build time). Day granularity matches the day-level display.
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function inGitTasks(): void {
  if (!existsSync(join(TASKS_DIR, ".git"))) {
    console.error(
      `error: ${TASKS_DIR} is not a git repo. Clone blazetrailsdev/tasks there, or set $TASKS_DIR to an existing checkout.`,
    );
    process.exit(1);
  }
}

// `cwd` defaults to TASKS_DIR (the canonical checkout the status mutations
// operate on). `refine` overrides it with an agent's worktree, which lives in
// the same repo but on a feature branch.
function git(args: string[], opts: { silent?: boolean; cwd?: string } = {}): string {
  return execFileSync("git", ["-C", opts.cwd ?? TASKS_DIR, ...args], {
    encoding: "utf8",
    stdio: opts.silent ? ["ignore", "pipe", "pipe"] : ["inherit", "pipe", "inherit"],
  }).trim();
}

// The only generated artifact that's tracked in git. `index.json` and
// `search.json` are also rebuilt by scripts/build-index.mjs but are now
// gitignored (rebuilt on demand by `loadIndex()`), so they can't dirty the
// tree and don't need restoring. `index.md` is the human-readable registry
// that stays tracked, rebuilt and re-staged by the pre-commit hook.
const GENERATED_INDEX_FILES = ["index.md"];

// `loadIndex()` runs before every mutation reaches commitAndPush, and when it
// finds the index stale it invokes build-index.mjs, which rewrites the tracked
// GENERATED_INDEX_FILES in the working tree. With git's default
// rebase.autoStash=false (CI, fresh checkouts) a subsequent `git pull --rebase`
// then aborts: "cannot pull with rebase: You have unstaged changes". With
// autoStash on it instead stashes the throwaway copy and can conflict against
// upstream's own regenerated index on reapply — so neither config is safe.
// `index.md` is regenerated and re-staged by the tasks repo's pre-commit hook
// on every commit, so the locally-rebuilt copy is throwaway — restore it to
// HEAD before pulling, leaving a clean tree regardless of git config.
// Restore each path independently so a path git doesn't track can't block the
// rest; a path git doesn't know isn't dirty, so skipping it is fine.
function restoreGeneratedFiles(cwd: string | undefined): void {
  for (const file of GENERATED_INDEX_FILES) {
    try {
      // `checkout HEAD --`, not `checkout --`: the latter only restores the
      // worktree from the index, leaving a *staged* generated-file change (e.g.
      // `M  index.md`) in place. assertCleanWorktree filters generated paths
      // by name regardless of staged state, so that residue would slip through
      // to `git pull --rebase`, which then aborts on a dirty index. Resetting to
      // HEAD discards both index and worktree state for the path.
      git(["checkout", "HEAD", "--", file], { silent: true, cwd });
    } catch {
      /* path unknown to git or already clean — nothing to restore here */
    }
  }
}

// Refuse to mutate when the working tree has uncommitted edits the user made by
// hand (e.g. editing a story's frontmatter, then running `priority`). The
// mutation loop's leading `git pull --rebase` runs *before* the mutator, so such
// edits sit dirty during the rebase: with rebase.autoStash off the pull aborts
// ("cannot pull with rebase: You have unstaged changes"), and with it on the
// edits are stashed, rebased over, and reapplied — writing literal git conflict
// markers into the story frontmatter when upstream touched the same lines. Both
// corrupt or strand the edit, so stop up front and tell the user to commit.
// GENERATED_INDEX_FILES are excluded: restoreGeneratedFiles already reset them
// to HEAD, and the tasks pre-commit hook rebuilds + re-stages them anyway.
// Untracked files (`??`) are ignored — they don't block a rebase.
function assertCleanWorktree(cwd: string | undefined): void {
  let porcelain: string;
  try {
    porcelain = git(["status", "--porcelain"], { silent: true, cwd });
  } catch {
    return; // not a git repo / git unavailable — the pull path surfaces it
  }
  // git() trims its output, so the first line loses porcelain's leading status
  // column space (" M foo" → "M foo"); re-trim every line and strip the 1–2
  // char XY code + whitespace to recover the path, rather than slicing a fixed
  // offset. Untracked files (`??`) don't block a rebase, so they're ignored.
  const dirty = porcelain
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("??"))
    .filter((l) => !GENERATED_INDEX_FILES.includes(l.replace(/^\S{1,2}\s+/, "")));
  if (dirty.length === 0) return;
  const where = cwd ?? TASKS_DIR;
  console.error(
    `error: ${where} has uncommitted changes; commit or stash them before mutating:\n` +
      dirty.map((l) => `  ${l}`).join("\n") +
      `\n  The tasks CLI rebases onto origin/main, which would corrupt or discard these edits.\n` +
      `  Commit them first:\n` +
      `    git -C "${where}" add -A && git -C "${where}" commit -m "wip"\n` +
      `  or stash them:  git -C "${where}" stash`,
  );
  process.exit(1);
}

// Fetch + hard-reset the per-worktree tasks checkout to origin/main before
// read commands. Keeps `ready`/`next-bundle`/`list`/`status` from serving
// a stale index when the checkout hasn't been updated since spawn. Only
// runs when using the per-worktree symlink (TASKS_DIR_IS_SYMLINK); the
// canonical fallback and explicit $TASKS_DIR overrides are left alone.
function syncFromOrigin(): void {
  if (!TASKS_DIR_IS_SYMLINK) return;
  try {
    git(["fetch", "--quiet", "origin"], { silent: true });
    git(["reset", "--hard", "--quiet", "origin/main"], { silent: true });
  } catch {
    /* best-effort — stale data is better than a broken CLI */
  }
}

function storyFilePath(index: Index, id: string): string {
  const entry = index.stories.find((s) => s.id === id);
  if (!entry) {
    console.error(`error: story "${id}" not found in index`);
    process.exit(1);
  }
  return join(TASKS_DIR, entry.file_path);
}

// Canonical frontmatter key order, mirrors buildStoryContent. Used by
// setFrontmatterList to insert an absent key in its conventional slot rather
// than appending at the end of the block.
const FRONTMATTER_KEY_ORDER = [
  "title",
  "status",
  "updated",
  "rfc",
  "cluster",
  "deps",
  "deps-rfc",
  "est-loc",
  "priority",
  "pr",
  "claim",
  "assignee",
  "blocked-by",
];

// Splits a story file into its frontmatter delimiters, the key/value lines
// inside the fenced block, and the body. Exits when the file has no fenced
// frontmatter. Shared by every frontmatter mutator so they parse identically.
function splitFrontmatter(file: string): {
  open: string;
  lines: string[];
  close: string;
  body: string;
} {
  const text = readFileSync(file, "utf8");
  const m = text.match(/^(---\n)([\s\S]*?)(\n---\n)([\s\S]*)$/);
  if (!m) {
    console.error(`error: ${file} has no frontmatter block`);
    process.exit(1);
  }
  return { open: m[1], lines: m[2].split("\n"), close: m[3], body: m[4] };
}

// Edits **single-line scalar** frontmatter fields only. Refuses to
// edit a key whose immediate next line is indented (i.e. a YAML list or
// nested map) — overwriting the key would orphan its children. The
// fields the CLI mutates today (status, claim, assignee, pr, blocked-by)
// are always scalars; refusing on lists is defensive.
export function editFrontmatter(file: string, edits: Record<string, string>): void {
  const { open, lines, close, body } = splitFrontmatter(file);
  for (const [key, value] of Object.entries(edits)) {
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].match(new RegExp(`^${key}:(\\s|$)`))) continue;
      const next = lines[i + 1];
      if (next && /^[ \t]/.test(next)) {
        console.error(`error: refusing to edit list-valued frontmatter key "${key}" in ${file}`);
        process.exit(1);
      }
      lines[i] = `${key}: ${value}`;
      found = true;
      break;
    }
    if (!found) lines.push(`${key}: ${value}`);
  }
  writeFileSync(file, open + lines.join("\n") + close + body);
}

// Deletes a **single-line scalar** frontmatter key. No-op when the key is
// already absent. Refuses list/nested keys for the same reason editFrontmatter
// does — removing the key alone would orphan its indented children.
export function removeFrontmatterKey(file: string, key: string): void {
  const { open, lines, close, body } = splitFrontmatter(file);
  const i = lines.findIndex((l) => new RegExp(`^${key}:(\\s|$)`).test(l));
  if (i === -1) return;
  if (lines[i + 1] && /^[ \t]/.test(lines[i + 1])) {
    console.error(`error: refusing to remove list-valued frontmatter key "${key}" in ${file}`);
    process.exit(1);
  }
  lines.splice(i, 1);
  writeFileSync(file, open + lines.join("\n") + close + body);
}

// Sets a **list-valued** frontmatter key, the array-block counterpart to
// editFrontmatter's scalar editor. Replaces the key's existing value whether
// it is inline flow (`deps: [a, b]`) or an indented block list, rendering an
// empty list inline (`[]`) and a non-empty list as a block. Inserts the key in
// its canonical position (per FRONTMATTER_KEY_ORDER) when absent. Every other
// line — sibling keys, inline comments, blank lines, body — is preserved
// byte-for-byte. Refuses anything deeper than a simple list (a nested map, or
// list items with their own indented children) for the same defensive reason
// editFrontmatter refuses lists: it cannot safely rewrite structure it does
// not model.
export function setFrontmatterList(file: string, key: string, items: string[]): void {
  const { open, lines, close, body } = splitFrontmatter(file);
  const rendered =
    items.length === 0 ? [`${key}: []`] : [`${key}:`, ...items.map((it) => `  - ${it}`)];

  const idx = lines.findIndex((l) => new RegExp(`^${key}:(\\s|$)`).test(l));
  if (idx === -1) {
    const ki = FRONTMATTER_KEY_ORDER.indexOf(key);
    let insertAt = lines.length;
    if (ki !== -1) {
      for (let i = 0; i < lines.length; i++) {
        const km = lines[i].match(/^([\w-]+):/);
        if (km && FRONTMATTER_KEY_ORDER.indexOf(km[1]) > ki) {
          insertAt = i;
          break;
        }
      }
    }
    lines.splice(insertAt, 0, ...rendered);
  } else {
    // Consume the key line plus any immediately following indented child lines
    // (the existing block list). A child that is not a `- scalar` item is a
    // nested map or multi-level structure we refuse to rewrite.
    let end = idx + 1;
    while (end < lines.length && /^[ \t]/.test(lines[end])) {
      if (!/^[ \t]+-\s/.test(lines[end])) {
        console.error(
          `error: refusing to set nested/multi-level frontmatter key "${key}" in ${file}`,
        );
        process.exit(1);
      }
      end++;
    }
    lines.splice(idx, end - idx, ...rendered);
  }
  writeFileSync(file, open + lines.join("\n") + close + body);
}

// ──────────────────── critical-section lock ────────────────────
//
// Every `pnpm tasks` mutation runs pull→commit→push against a checkout sharing
// ONE git object store with every other agent's (canonical tree + per-worktree
// `tasks/` symlinks are worktrees of the same clone). Unserialized, a push loser
// rebases, retries, loses again, then `reset --hard` discards its edit — a
// claim/done silently vanishes (observed 2026-06-08). An advisory file lock in
// the shared common git dir serializes them; a mutation that can't get in by the
// timeout fails loudly with LOCK_TIMEOUT_EXIT (distinct from race codes 2/3/4/99).
//
// Deliberately NOT self-healing: a waiter NEVER removes a lock it didn't create.
// Auto-reclaiming a "stale" lock means deleting then recreating the path, and a
// third waiter can `wx`-acquire in that vacancy — two holders, a SILENTLY dropped
// edit (the exact bug we fix). No POSIX primitive removes a path conditional on
// identity, so reclaim can't be race-free; instead we fail loudly (rm a dead lock).
export const LOCK_TIMEOUT_EXIT = 75;
const LOCK_WAIT_MS = 180_000;
const LOCK_POLL_MS = 100;

// Test seam: redirect the lock file off the real shared lock. Production never sets it.
let lockDirForTest: string | null = null;
export function __setLockDirForTest(dir: string | null): void {
  lockDirForTest = dir;
}

// Synchronous sleep with no node timer: park on an Atomics wait against a
// throwaway shared buffer. The CLI is short-lived, so this is fine.
function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Resolve the shared common git dir WITHOUT shelling out to git: `.git` is a
// directory in the main checkout, or a `gitdir:` pointer file in a worktree
// whose `commondir` names the shared dir.
export function gitCommonDir(dir: string): string {
  const dotgit = join(dir, ".git");
  if (statSync(dotgit).isDirectory()) return dotgit;
  const gitdir = resolve(
    dir,
    readFileSync(dotgit, "utf8")
      .replace(/^gitdir:\s*/, "")
      .trim(),
  );
  try {
    return resolve(gitdir, readFileSync(join(gitdir, "commondir"), "utf8").trim());
  } catch {
    return gitdir;
  }
}

// Stamp `pid.seq.now`: pid drives liveness-based staleness, seq distinguishes
// acquisitions within one process (unit tests), now disambiguates a reused pid.
let lockSeq = 0;
function newLockToken(): string {
  return `${process.pid}.${++lockSeq}.${Date.now()}`;
}

// Is the lock's owner process gone? Agents share one working tree → one host, so
// PID-liveness is authoritative. A dead owner's lock is never released, so fail
// fast instead of waiting. Unparseable content counts as live (wait, time out).
function lockHolderDead(content: string): boolean {
  const pid = Number(content.split(".")[0]);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false; // signal 0 succeeded — holder is alive
  } catch (e) {
    return (e as { code?: string }).code === "ESRCH"; // ESRCH = gone; EPERM = alive (other uid)
  }
}

export interface LockHandle {
  path: string;
  token: string;
}

// Locks this process currently holds. We release them on fatal termination
// signals (below) so a CLI killed mid-mutation — pane/worktree teardown, an
// interrupted agent, a timed-out `git push` whose pane is then killed — never
// leaves a stale lock behind. A signal death skips both the `finally` and the
// explicit `process.exit` releases, so without this the lock leaks every time,
// and the next agent has to clear a "held by a dead process" lock by hand.
const activeLocks = new Set<LockHandle>();
let lockSignalsInstalled = false;
function installLockSignalHandlers(): void {
  if (lockSignalsInstalled) return;
  lockSignalsInstalled = true;
  // 128 + signal number is the conventional shell exit code for a signal death.
  const codes: Record<string, number> = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };
  for (const sig of Object.keys(codes)) {
    process.on(sig as NodeJS.Signals, () => {
      for (const l of activeLocks) releaseTasksLock(l);
      process.exit(codes[sig]);
    });
  }
}

// Acquire the exclusive tasks-CLI lock for `cwd`. Returns an owner handle, or
// null when no shared git dir is resolvable (proceed unlocked — nothing to
// serialize). Creation is atomic via `wx`: one agent wins each round, the rest
// poll. A holder whose process is gone (ESRCH) is reclaimed automatically — its
// lock can never be released, so making a human/agent `rm` it was only busywork
// (and a racy one: concurrent rm+retry can delete a freshly-taken live lock).
// Only the wait timeout against a *live* holder still fails loudly.
export function acquireTasksLock(
  cwd: string | undefined,
  opts: { waitMs?: number; pollMs?: number } = {},
): LockHandle | null {
  const waitMs = opts.waitMs ?? LOCK_WAIT_MS;
  const pollMs = opts.pollMs ?? LOCK_POLL_MS;
  let lockPath: string;
  try {
    lockPath = join(lockDirForTest ?? gitCommonDir(cwd ?? TASKS_DIR), "tasks-cli.lock");
  } catch {
    return null; // no resolvable git dir — nothing to lock against
  }
  const token = newLockToken();
  for (let waited = 0; ; waited += pollMs) {
    try {
      writeFileSync(lockPath, `${token}\n`, { flag: "wx" });
      // Won the create — but a concurrent reclaimer that read a now-removed dead
      // holder could `unlinkSync` this fresh lock out from under us. Confirm we
      // still own the path before returning; if not, contend again. Reclaiming
      // stops the moment a *live* token is observed, so this converges.
      if (readFileSync(lockPath, "utf8").trim() === token) {
        const handle = { path: lockPath, token };
        activeLocks.add(handle);
        installLockSignalHandlers();
        return handle;
      }
      continue;
    } catch (e) {
      if ((e as { code?: string }).code !== "EEXIST") return null; // dir gone — best effort
      let observed = "";
      try {
        observed = readFileSync(lockPath, "utf8").trim();
      } catch {
        continue; // vanished between create and read — retry create
      }
      // Holder process is gone: its lock will never be released. Reclaim it by
      // removing the corpse, then contend for a fresh lock. We re-read the file
      // immediately before unlinking and only remove it while it still carries
      // the dead token, so we never delete a lock a live process has re-taken;
      // the verify-after-create above covers the residual race. Best effort: a
      // rival reclaimer may have removed it first (ENOENT) — that's fine.
      if (lockHolderDead(observed)) {
        try {
          if (readFileSync(lockPath, "utf8").trim() === observed) unlinkSync(lockPath);
        } catch {
          /* already removed / replaced — fall through and retry create */
        }
        continue;
      }
      if (waited >= waitMs) {
        console.error(
          `error: timed out after ${Math.round(waitMs / 1000)}s waiting for the tasks-CLI ` +
            `lock at ${lockPath}. Another mutation is holding it; retry shortly.`,
        );
        process.exit(LOCK_TIMEOUT_EXIT);
      }
      sleepMs(pollMs);
    }
  }
}

// Release a lock from acquireTasksLock. Idempotent and ownership-safe: removes
// it ONLY while it carries our token, and always drops it from the active set
// so the signal handlers don't try to re-release a handle we've let go. The
// read-then-unlink is race-free because no waiter removes/recreates a lock it
// didn't create (acquire only `wx`s onto a free path, or reclaims a dead one).
export function releaseTasksLock(lock: LockHandle | null): void {
  if (!lock) return;
  activeLocks.delete(lock);
  try {
    if (readFileSync(lock.path, "utf8").trim() === lock.token) unlinkSync(lock.path);
  } catch {
    /* already removed / unreadable — nothing of ours to release */
  }
}

// Pull-rebase → run mutator → commit → push, retrying once on
// non-fast-forward. `mutator` is run inside each attempt so a rebased
// index file is re-read between tries. Throws (and asks caller to
// retry) only after two consecutive lost races.
export function commitAndPush(opts: {
  message: string;
  fileToStage: string;
  mutator: () => void;
  raceMessage: string;
  raceExitCode: number;
  // Default pushRefspec is `HEAD:main` so per-worktree checkouts on their
  // own branch push to origin/main regardless of branch name. Pass an
  // explicit bare-branch refspec (e.g. `"main"`) only when calling from a
  // checkout known to be on that branch.
  cwd?: string;
  pushRefspec?: string;
}): void {
  const cwd = opts.cwd;
  const pushRefspec = opts.pushRefspec ?? "HEAD:main";
  // Guard for bare-branch refspecs (e.g. an explicit `pushRefspec: "main"`).
  // A bare refspec pushes the LOCAL branch of that name — NOT HEAD. If the
  // checkout is parked on some other branch, `git pull --rebase origin main`
  // rebases the wrong branch, the commit lands off `main`, and `git push
  // origin main` shoves a stale local `main` ref at origin → rejected
  // non-fast-forward on every attempt. That rejection is indistinguishable
  // from a lost race in the loop below, so without this guard the mutation
  // silently burns both attempts, exits with raceExitCode, and `reset --hard`
  // throws the edit away — the claim is lost, not lost to a rival. Fail
  // loudly instead. Refspecs containing a colon (e.g. `HEAD:main`, the
  // default) are exempt because they push HEAD regardless of branch name.
  if (!pushRefspec.includes(":")) {
    let head = "";
    try {
      head = git(["symbolic-ref", "--quiet", "--short", "HEAD"], { silent: true, cwd });
    } catch {
      /* detached HEAD — symbolic-ref exits non-zero; leave head = "" */
    }
    if (head !== pushRefspec) {
      const where = cwd ?? TASKS_DIR;
      console.error(
        `error: ${where} is on branch "${head || "(detached HEAD)"}", not "${pushRefspec}". ` +
          `The tasks CLI mutates "${pushRefspec}" directly; check it out there first:\n` +
          `  git -C "${where}" checkout ${pushRefspec} && git -C "${where}" pull --ff-only origin ${pushRefspec}`,
      );
      process.exit(1);
    }
  } else {
    // Colon refspec (`HEAD:main`, the per-worktree default): the push carries
    // *every* commit on HEAD that origin/main lacks — not just the mutation
    // we're about to make. Both callers of this path expect HEAD to be even
    // with origin/main *before* the mutation commit:
    //   - story flips on the shared canonical checkout (resolved via a
    //     per-worktree `<cwd>/tasks` symlink): syncFromOrigin hard-resets it to
    //     origin/main, so it sits exactly at origin/main.
    //   - `refine` in an agent's tasks worktree: the agent leaves *working-tree*
    //     edits (re-applied by the mutator), never commits, so its branch HEAD
    //     is still at origin/main.
    // If HEAD is already AHEAD, those pre-existing commits are foreign work
    // (e.g. a hand-authored RFC branch checked out in the shared dir, or an
    // agent that committed when it should have left edits unstaged) that
    // `git push HEAD:main` would silently shove onto main. That is exactly the
    // leak that put a `0000-` RFC placeholder onto main. Refuse loudly instead.
    //
    // The fetch is a deliberate extra round-trip: the loop below also fetches
    // (via `pull --rebase`), but the guard must establish a *current* baseline
    // *before* the mutation commit, and a stale origin/main would mis-count.
    // The second fetch is a near-noop. Best-effort: a fetch failure (offline)
    // leaves no baseline, so we skip the check rather than block all writes.
    let ahead = "";
    try {
      git(["fetch", "--quiet", "origin", "main"], { silent: true, cwd });
      ahead = git(["rev-list", "--count", "origin/main..HEAD"], { silent: true, cwd }).trim();
    } catch {
      /* offline / no origin — leave ahead = "" so the guard skips rather than
         blocking the mutation; do NOT swallow the process.exit below. */
    }
    if (ahead !== "" && ahead !== "0") {
      const where = cwd ?? TASKS_DIR;
      console.error(
        `error: ${where} HEAD is ${ahead} commit(s) ahead of origin/main; ` +
          `pushing "${pushRefspec}" would carry them onto main.\n` +
          `  This dir is the tasks CLI's working checkout — it must not hold un-pushed\n` +
          `  branch work. Author RFCs/branches in a separate worktree (scripts/start-worktree.sh).\n` +
          `  To recover: first save those commits if you want them\n` +
          `    git -C "${where}" branch -f <save-branch> HEAD\n` +
          `  then return the checkout to origin/main (this discards them from HEAD):\n` +
          `    git -C "${where}" fetch origin && git -C "${where}" reset --hard origin/main`,
      );
      process.exit(1);
    }
  }
  // Clear any loadIndex()-regenerated artifacts so the dirty-tree check and the
  // pull below see a clean tree. Done BEFORE acquiring the lock: both operate
  // only on this worktree's own files, and assertCleanWorktree may process.exit
  // (skipping the lock's finally) — keeping them outside the critical section
  // means that refusal can't leak the shared lock. Only needed before the first
  // attempt — the retry path resets hard to origin/main, which discards them.
  restoreGeneratedFiles(cwd);
  // Bail before touching the remote if the user left hand edits in the tree —
  // the pull below would corrupt them. (refine pre-cleans its file, so it sails
  // past.)
  assertCleanWorktree(cwd);
  // Serialize the whole pull→commit→push section against every other agent's
  // checkout. process.exit skips the `finally`, so the exit paths release
  // explicitly too (releaseTasksLock is idempotent; stale-steal backstops a
  // crash where neither runs).
  const lock = acquireTasksLock(cwd);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        git(["pull", "--rebase", "--quiet", "origin", "main"], { cwd });
      } catch (e) {
        // A rebase conflict (divergent remote whose commits touch the same
        // lines) leaves the repo mid-rebase with a detached HEAD and conflict
        // markers in the tree. Abort it so the checkout returns to a clean
        // branch tip, then surface a recoverable message rather than stranding
        // the user in a half-finished rebase to discover by hand.
        try {
          git(["rebase", "--abort"], { silent: true, cwd });
        } catch {
          /* nothing in progress to abort (e.g. fetch failed before rebase) */
        }
        const where = cwd ?? TASKS_DIR;
        const stderr = String(((e as { stderr?: unknown }).stderr ?? "") || "").trim();
        console.error(
          `error: git pull --rebase onto origin/main failed in ${where} ` +
            `(rebase aborted, working tree restored).\n` +
            (stderr ? `${stderr}\n` : "") +
            `  Reconcile with the remote manually, then retry the command:\n` +
            `    git -C "${where}" pull --rebase origin main`,
        );
        releaseTasksLock(lock);
        process.exit(1);
      }
      opts.mutator();
      git(["add", opts.fileToStage], { cwd });
      git(["commit", "-q", "-m", opts.message], { cwd });
      try {
        git(["push", "--quiet", "origin", pushRefspec], { silent: true, cwd });
        return;
      } catch (e) {
        const stderr = String(((e as { stderr?: unknown }).stderr ?? "") || "");
        // git push prints "[rejected]" / "non-fast-forward" / "fetch first"
        // on the lost-race case. Anything else (auth, network, branch
        // protection, pre-receive hook failure) is a real error and must
        // be surfaced verbatim — not silently reset-and-retried.
        if (!/rejected|non-fast-forward|fetch first/i.test(stderr)) {
          console.error(stderr.trim() || "git push failed (no stderr)");
          releaseTasksLock(lock);
          process.exit(1);
        }
        git(["reset", "--hard", "origin/main"], { silent: true, cwd });
        if (attempt === 1) {
          console.error(opts.raceMessage);
          releaseTasksLock(lock);
          process.exit(opts.raceExitCode);
        }
      }
    }
  } finally {
    releaseTasksLock(lock);
  }
}

// All mutations enter via `flip`. The order — `inGitTasks()` then
// `loadIndex()` — matters: if `$TASKS_DIR` is missing or not a git repo,
// the friendly error from `inGitTasks` fires before `loadIndex` would try
// to `execFileSync` the tasks-side build script in a non-repo directory.
// `mutate` receives the resolved file path so command implementations
// don't repeat the lookup.
function flip(
  id: string,
  message: string,
  raceMessage: string,
  raceExitCode: number,
  mutate: (file: string) => void,
): void {
  inGitTasks();
  const file = storyFilePath(loadIndex(), id);
  commitAndPush({
    message,
    fileToStage: file,
    raceMessage,
    raceExitCode,
    // Per-worktree checkout: HEAD:main pushes the mutation regardless of
    // branch name. Canonical checkout: bare "main" preserves the branch
    // guard so a stray-branch checkout fails loudly rather than pushing
    // stale content to origin/main.
    pushRefspec: TASKS_DIR_IS_SYMLINK ? "HEAD:main" : "main",
    mutator: () => {
      mutate(file);
      editFrontmatter(file, { updated: today() });
    },
  });
}

// Returns the content between a story file's leading `---` fences, or "" when
// there is no fenced block. Mirrors the tasks repo's canonical parser
// (`tasks/scripts/lib.mjs` parseFrontmatter), which loads keys ONLY from inside
// the fences — so probes for `claim`/`assignee` never match a same-named line
// in the Markdown body.
function frontmatterBlock(fileText: string): string {
  return fileText.match(/^---\n([\s\S]*?)\n---\n?/)?.[1] ?? "";
}

// Decides what `claim` should do given a story file's full text and the
// requesting assignee. Pure (no I/O) so the three-way branch is unit-testable
// without a git repo. Reads only the fenced frontmatter (via frontmatterBlock)
// with the same raw-regex style as the rest of this file.
//   "available" — unclaimed (`claim: null`); proceed to write the claim.
//   "owned"     — already claimed by `assignee`; an idempotent re-claim.
//   "taken"     — claimed by someone else; a genuine lost race.
export function claimState(fileText: string, assignee: string): "available" | "owned" | "taken" {
  const fm = frontmatterBlock(fileText);
  if (/^claim: null\s*$/m.test(fm)) return "available";
  const held = fm.match(/^assignee:\s*"?([^"\n]*)"?\s*$/m)?.[1] ?? null;
  return held === assignee ? "owned" : "taken";
}

function claim(id: string, assignee: string): void {
  flip(id, `claim: ${id}`, `lost claim race on ${id} — pick another story`, 3, (file) => {
    const fm = readFileSync(file, "utf8");
    const state = claimState(fm, assignee);
    if (state === "owned") {
      // Idempotent re-claim. `claim` is run more than once for the same story
      // across separate invocations — e.g. a prior `claim` pushed the claim to
      // main but then errored client-side (commitAndPush exits 1 on a non-race
      // push failure, without retrying), and the operator/loop re-runs it. The
      // `git pull --rebase` inside commitAndPush brings our own already-landed
      // claim back onto the working tree, so re-claiming what we already hold
      // is a success, not a conflict. (A within-invocation retry can't reach
      // here: commitAndPush only resets-and-retries on a *lost* race, where our
      // push never landed and the claim is still null or held by someone else.)
      console.log(`claimed ${id} as ${assignee}`);
      process.exit(0);
    }
    if (state === "taken") {
      console.error(`error: ${id} is already claimed`);
      process.exit(2);
    }
    const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    editFrontmatter(file, {
      status: "claimed",
      claim: JSON.stringify(now),
      assignee: JSON.stringify(assignee),
    });
  });
  console.log(`claimed ${id} as ${assignee}`);
}

const RETRY_MSG = (id: string) => `failed to update ${id} after retry — pull manually and retry`;

function inProgress(id: string, pr: number): void {
  flip(id, `in-progress: ${id} #${pr}`, RETRY_MSG(id), 4, (file) =>
    editFrontmatter(file, { status: "in-progress", pr: String(pr) }),
  );
  console.log(`marked ${id} in-progress #${pr}`);
}

function done(id: string, pr: number): void {
  flip(id, `done: ${id} #${pr}`, RETRY_MSG(id), 4, (file) =>
    editFrontmatter(file, { status: "done", pr: String(pr) }),
  );
  console.log(`marked ${id} done #${pr}`);
}

function block(id: string, reason: string): void {
  flip(id, `block: ${id} — ${reason}`, RETRY_MSG(id), 4, (file) =>
    editFrontmatter(file, { status: "blocked", "blocked-by": JSON.stringify(reason) }),
  );
  console.log(`blocked ${id}: ${reason}`);
}

// Set (or, with `priority === null`, clear) a story's ready-queue priority.
// Lower sorts first; absent = unprioritized (sorts last). Unlike the other
// mutations this leaves `status` untouched — it only reorders the queue. The
// caller validates the integer; build-index/validate enforce non-negative.
function setPriority(id: string, priority: number | null): void {
  // Short-circuit a no-op. Unlike the status mutations (which always change a
  // field), re-running priority with the unchanged value would leave nothing
  // to commit — `git commit` then errors "nothing to commit". Compare against
  // the indexed value and report cleanly instead of pushing an empty change.
  const entry = loadIndex().stories.find((s) => s.id === id);
  if (entry && entry.priority === priority) {
    // loadIndex() may have rebuilt — and so dirtied — the generated index files
    // in the canonical checkout. The status mutations let commitAndPush restore
    // them before its pull; this early return skips that, so clean up here to
    // avoid leaving the tasks checkout dirty.
    restoreGeneratedFiles(TASKS_DIR);
    console.log(
      priority === null ? `priority already clear on ${id}` : `${id} already priority ${priority}`,
    );
    return;
  }
  const message = priority === null ? `priority clear: ${id}` : `priority ${priority}: ${id}`;
  flip(id, message, RETRY_MSG(id), 4, (file) => {
    if (priority === null) removeFrontmatterKey(file, "priority");
    else editFrontmatter(file, { priority: String(priority) });
  });
  console.log(priority === null ? `cleared priority on ${id}` : `set ${id} priority ${priority}`);
}

// Legal story-status transitions reachable via `status-set`. The forward
// work-tracking moves (claimed/in-progress/done) own dedicated verbs that stamp
// pr/assignee, so this command covers the queue-shaping edits the lifecycle
// otherwise leaves as hand edits: draft ↔ ready (file then defer), and
// blocked → ready (the documented unblock path — README's
// "blocked (→ ready once unblocked)" — which has no dedicated verb).
const STATUS_TRANSITIONS: Record<StoryStatus, readonly StoryStatus[]> = {
  draft: ["ready"],
  ready: ["draft"],
  claimed: [],
  "in-progress": [],
  done: [],
  blocked: ["ready"],
};

// Work-tracking statuses own dedicated verbs that also stamp pr/assignee/
// blocked-by. status-set deliberately won't reach them; the rejection points
// the operator at the right verb instead of leaving them guessing.
const STATUS_VERB_HINT: Partial<Record<StoryStatus, string>> = {
  claimed: "claim <id>",
  "in-progress": "in-progress <id> --pr <N>",
  done: "done <id> --pr <N>",
  blocked: "block <id> --reason <text>",
};

// Reads the `status:` scalar from a story file's frontmatter, parsed with the
// same YAML semantics the tasks repo uses (lib.mjs `yaml.load`) so comments and
// quoting (`status: ready # note`) resolve correctly rather than tripping the
// raw-regex. Returns the RAW value (not yet validated against STORY_STATUSES — a
// hand-typo'd status is rejected downstream by statusTransitionError). Reads
// only the fenced block, so a `status:` line in the Markdown body never matches.
export function statusOf(fileText: string): string | null {
  let fm: Record<string, unknown>;
  try {
    fm = (parseYaml(frontmatterBlock(fileText)) ?? {}) as Record<string, unknown>;
  } catch {
    // Malformed frontmatter — mirror the tasks parser, which records a parse
    // failure rather than throwing (lib.mjs). Returning null surfaces the
    // "cannot read current status" CLI error instead of a YAML stack trace.
    return null;
  }
  return typeof fm.status === "string" ? fm.status : null;
}

// Pure transition check, unit-testable without a git repo. Returns null when the
// move is legal, otherwise a human-readable rejection reason. `from` is the raw
// parsed scalar, so an unrecognized current status is caught here rather than
// dereferencing STATUS_TRANSITIONS with an out-of-set key.
export function statusTransitionError(from: string | null, target: StoryStatus): string | null {
  if (from === null) return `cannot read current status`;
  if (!STORY_STATUSES.includes(from as StoryStatus)) {
    return `unrecognized current status "${from}" — fix the frontmatter by hand`;
  }
  const allowed = STATUS_TRANSITIONS[from as StoryStatus];
  if (from === target || allowed.includes(target)) return null;
  // Illegal move — give the most actionable message. A work-tracking target has
  // a dedicated verb; otherwise report the legal set (or that there is none).
  if (STATUS_VERB_HINT[target]) {
    return `won't set status ${target} — use \`pnpm tasks ${STATUS_VERB_HINT[target]}\` instead`;
  }
  return allowed.length
    ? `illegal transition ${from} → ${target} (allowed from ${from}: ${allowed.join(", ")})`
    : `illegal transition ${from} → ${target} (${from} has no transitions; use the dedicated verb)`;
}

// Frontmatter edits for a status transition. Unblocking back to ready returns
// the story to the ready queue for re-claim, so reset it to the unclaimed shape:
// clear the `blocked-by` the `block` verb stamped AND the claim/assignee/pr it
// carried in. A blocked story keeps its claim (block doesn't clear it), and
// claimState reads any non-null `claim` on a ready story as already taken —
// leaving them set would make the readied story unclaimable.
export function statusEdits(from: string | null, target: StoryStatus): Record<string, string> {
  const edits: Record<string, string> = { status: target };
  if (from === "blocked" && target === "ready") {
    Object.assign(edits, { "blocked-by": "null", claim: "null", assignee: "null", pr: "null" });
  }
  return edits;
}

// Flip a story's status between pre-work queue states (draft ↔ ready). Rebuilds
// + commits the index like the other mutating verbs. No-ops short-circuit before
// the commit (an empty `git commit` would fail); the transition is validated
// *inside* the mutator — i.e. against the post-`git pull` state — so a story
// claimed out from under us by a concurrent agent is never clobbered.
function setStatus(id: string, target: StoryStatus): void {
  const file = storyFilePath(loadIndex(), id);
  const from = statusOf(readFileSync(file, "utf8"));
  if (from === target) {
    // loadIndex() may have rebuilt the generated index files in the canonical
    // checkout; this early return skips commitAndPush's restore, so clean up.
    restoreGeneratedFiles(TASKS_DIR);
    console.log(`${id} already ${target}`);
    return;
  }
  // Fail fast on an obviously-illegal move before touching git, with the same
  // message the post-pull recheck would print.
  const preError = statusTransitionError(from, target);
  if (preError !== null) {
    restoreGeneratedFiles(TASKS_DIR);
    console.error(`error: ${preError} for ${id}`);
    process.exit(2);
  }
  flip(id, `status ${target}: ${id}`, RETRY_MSG(id), 4, (file) => {
    const fresh = statusOf(readFileSync(file, "utf8"));
    if (fresh === target) {
      // Concurrent agent already landed this exact move; the pull brought it
      // back. Re-applying would leave nothing to commit, so bail cleanly.
      console.log(`${id} already ${target}`);
      process.exit(0);
    }
    const error = statusTransitionError(fresh, target);
    if (error !== null) {
      console.error(`error: ${error} for ${id}`);
      process.exit(2);
    }
    editFrontmatter(file, statusEdits(fresh, target));
  });
  console.log(`set ${id} status ${target}`);
}

// ──────────────────── RFC frontmatter mutations ────────────────────

// Pure validation of the `rfc` command's status/supersede pairing, unit-testable
// without a git repo. Returns null when the request is coherent, else a
// human-readable rejection. `--supersede` and `status: superseded` are bound:
// either one implies the other, and the validator (and finalize-rfc) require a
// `superseded-by` target whenever status is superseded — so we reject the
// half-specified forms up front rather than committing an invalid frontmatter.
export function rfcStatusError(
  status: string | undefined,
  supersede: string | undefined,
): string | null {
  if (status !== undefined && !RFC_STATUSES.includes(status as RfcStatus)) {
    return `invalid status "${status}" — expected one of ${RFC_STATUSES.join(", ")}`;
  }
  if (status === "superseded" && supersede === undefined) {
    return `status superseded requires --supersede <other-slug>`;
  }
  if (supersede !== undefined && status !== undefined && status !== "superseded") {
    return `--supersede conflicts with --status ${status} (it implies status superseded)`;
  }
  return null;
}

function rfcFilePath(index: Index, slug: string): string {
  const entry = index.rfcs.find((r) => r.id === slug);
  if (!entry) {
    console.error(`error: RFC "${slug}" not found in index`);
    process.exit(1);
  }
  return join(TASKS_DIR, entry.file_path);
}

function parseCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// `tasks rfc <slug>` — overloaded RFC frontmatter editor covering the moves
// previously made by hand: status transitions (with the superseded/superseded-by
// pairing), and the array fields related-rfcs / clusters / packages. Every
// requested reference (--supersede / --relate targets) is checked against the
// index *before* any write, and a clusters change that would orphan one of this
// RFC's stories is surfaced as a warning early (the validator would reject it at
// commit time). All edits go through one commitAndPush so `updated` is bumped and
// the change lands atomically.
function rfc(
  slug: string,
  opts: {
    status?: string;
    supersede?: string;
    relate?: string;
    clusters?: string;
    packages?: string;
  },
): void {
  inGitTasks();
  const index = loadIndex();
  const file = rfcFilePath(index, slug);

  const statusError = rfcStatusError(opts.status, opts.supersede);
  if (statusError !== null) {
    restoreGeneratedFiles(TASKS_DIR);
    console.error(`error: ${statusError} for ${slug}`);
    process.exit(2);
  }

  // --supersede implies status superseded even when --status is omitted.
  const status = opts.supersede !== undefined ? "superseded" : opts.status;

  const rfcExists = (s: string): boolean => index.rfcs.some((r) => r.id === s);
  if (opts.supersede !== undefined && !rfcExists(opts.supersede)) {
    restoreGeneratedFiles(TASKS_DIR);
    console.error(`error: --supersede target "${opts.supersede}" does not exist`);
    process.exit(2);
  }
  const relate = opts.relate !== undefined ? parseCsv(opts.relate) : undefined;
  if (relate) {
    const missing = relate.filter((r) => !rfcExists(r));
    if (missing.length) {
      restoreGeneratedFiles(TASKS_DIR);
      console.error(`error: --relate target(s) do not exist: ${missing.join(", ")}`);
      process.exit(2);
    }
  }
  const clusters = opts.clusters !== undefined ? parseCsv(opts.clusters) : undefined;
  const packages = opts.packages !== undefined ? parseCsv(opts.packages) : undefined;

  if (
    status === undefined &&
    relate === undefined &&
    clusters === undefined &&
    packages === undefined
  ) {
    restoreGeneratedFiles(TASKS_DIR);
    usage();
  }

  // Warn (don't block) on a clusters change that drops a cluster still referenced
  // by one of this RFC's stories — the same condition `validate.mjs` rejects at
  // commit. Surfacing it here gives an actionable message before the pre-commit
  // hook fails the push with a less obvious error.
  if (clusters !== undefined) {
    const orphaned = index.stories
      .filter((s) => s.rfc === slug && s.cluster !== null && !clusters.includes(s.cluster))
      .map((s) => `${s.id} (cluster "${s.cluster}")`);
    if (orphaned.length) {
      console.warn(
        `warning: clusters change orphans ${orphaned.length} story/stories whose cluster is no ` +
          `longer declared: ${orphaned.join(", ")}. The commit will fail validation unless you ` +
          `reassign them (pnpm tasks ... ) or keep the cluster.`,
      );
    }
  }

  const changes: string[] = [];
  if (status !== undefined) {
    changes.push(
      opts.supersede !== undefined ? `superseded by ${opts.supersede}` : `status ${status}`,
    );
  }
  if (relate !== undefined) changes.push(`relate [${relate.join(", ")}]`);
  if (clusters !== undefined) changes.push(`clusters [${clusters.join(", ")}]`);
  if (packages !== undefined) changes.push(`packages [${packages.join(", ")}]`);

  commitAndPush({
    message: `rfc ${slug}: ${changes.join(", ")}`,
    fileToStage: file,
    raceMessage: RETRY_MSG(slug),
    raceExitCode: 4,
    pushRefspec: TASKS_DIR_IS_SYMLINK ? "HEAD:main" : "main",
    mutator: () => {
      if (status !== undefined) {
        const scalar: Record<string, string> = { status };
        if (opts.supersede !== undefined) scalar["superseded-by"] = JSON.stringify(opts.supersede);
        editFrontmatter(file, scalar);
      }
      if (relate !== undefined) setFrontmatterList(file, "related-rfcs", relate);
      if (clusters !== undefined) setFrontmatterList(file, "clusters", clusters);
      if (packages !== undefined) setFrontmatterList(file, "packages", packages);
      editFrontmatter(file, { updated: today() });
    },
  });
  console.log(`rfc ${slug}: ${changes.join(", ")}`);
}

// Single exit point for a refine agent: commit whatever it edited in the
// story file in place, push with the same rebase-retry as the other
// mutations, and print a machine-readable summary the orchestration layer
// forwards to btwhooks (POST /cleanup-pane without a PR).
//
// `dir` is the agent's tasks worktree (its cwd) — a checkout of the same
// repo on a feature branch. The CLI script itself resolves via the trails
// package.json, so the agent runs `cd <trails> && pnpm tasks refine <id>
// --dir <its-worktree>`; without `--dir` we operate on TASKS_DIR. We read
// the story's repo-relative path from the canonical index, then act on the
// copy inside `dir`.
//
// The agent leaves its edits in the worktree (citations, path:line fixes,
// priority, an optional done-note). We capture that content, then `git
// checkout` the file back to HEAD so `commitAndPush`'s leading `pull
// --rebase` runs against a clean tree; the captured content is re-applied
// inside each attempt (so a rebase between tries can't drop it), and the
// push is `HEAD:main`. With `--pr <N>` the story is also flipped to done —
// making this one command replace the old "edit + git push" / "pnpm tasks
// done" fork.
//
// Caveat: re-applying the full captured file clobbers any concurrent
// upstream edit to the SAME story file rather than 3-way merging it. One
// refine agent runs per story, so same-file races are effectively
// nonexistent; the scalar-field mutations above don't have this property
// because they re-read and edit specific keys.
function refine(id: string, pr: number | null, dir: string): void {
  inGitTasks();
  if (!existsSync(join(dir, ".git"))) {
    console.error(`error: ${dir} is not a git worktree (pass --dir <tasks worktree>)`);
    process.exit(1);
  }
  const entry = loadIndex().stories.find((s) => s.id === id);
  if (!entry) {
    console.error(`error: story "${id}" not found in index`);
    process.exit(1);
  }
  const file = join(dir, entry.file_path);
  if (!existsSync(file)) {
    console.error(`error: ${file} not found in worktree`);
    process.exit(1);
  }

  const edited = readFileSync(file, "utf8");
  git(["checkout", "--", file], { silent: true, cwd: dir });
  const changed = edited !== readFileSync(file, "utf8");

  if (!changed && pr === null) {
    console.log(`refine: ${id} no-change`);
    console.log(JSON.stringify({ id, outcome: "no-change", pushed: false, pr: null }));
    return;
  }

  commitAndPush({
    cwd: dir,
    pushRefspec: "HEAD:main",
    message: pr !== null ? `refine: ${id} #${pr}` : `refine: ${id}`,
    fileToStage: file,
    raceMessage: RETRY_MSG(id),
    raceExitCode: 4,
    mutator: () => {
      writeFileSync(file, edited);
      const fields: Record<string, string> = { updated: today() };
      if (pr !== null) {
        fields.status = "done";
        fields.pr = String(pr);
      }
      editFrontmatter(file, fields);
    },
  });

  const outcome = pr !== null ? "done" : "changed";
  console.log(`refine: ${id} ${outcome}${pr !== null ? ` #${pr}` : ""}`);
  console.log(JSON.stringify({ id, outcome, pushed: true, pr }));
}

// ──────────────────── editor-driven body edit ────────────────────

// Resolves an `edit` argument to a repo-relative `.md` path. The same token
// addresses either a story (matched by id in the index's stories) or an RFC
// README (matched by slug in its rfcs) — RFC-body editing is the load-bearing
// case for RFC 0024's "no hand-editing the tasks repo" goal. Stories are tried
// first; both id and slug namespaces are flat and distinct in practice. Returns
// null when neither matches, so the caller prints one error. Pure for tests.
export function resolveEditTarget(index: Index, idOrSlug: string): string | null {
  const story = index.stories.find((s) => s.id === idOrSlug);
  if (story) return story.file_path;
  const rfc = index.rfcs.find((r) => r.id === idOrSlug);
  if (rfc) return rfc.file_path;
  return null;
}

// The editor command to spawn, as argv: $VISUAL, then $EDITOR, then a `vi`
// fallback. Split on whitespace so `EDITOR="code --wait"` is honored. Pure and
// exported so the precedence/fallback is unit-testable without spawning.
export function editorArgv(env: { VISUAL?: string; EDITOR?: string }): string[] {
  const spec = env.VISUAL?.trim() || env.EDITOR?.trim() || "vi";
  return spec.split(/\s+/);
}

// `tasks edit <id-or-rfc-slug>`: open a story or RFC README in $EDITOR and
// commit the saved content via the same full-content write path `refine` uses.
// Copies the target to a temp file so the canonical checkout never goes dirty;
// short-circuits with no commit when the editor exits unchanged (mirrors
// refine's no-change case). Frontmatter the user edits is preserved verbatim by
// the full-content write; only `updated` is bumped afterward.
function edit(idOrSlug: string): void {
  inGitTasks();
  const target = resolveEditTarget(loadIndex(), idOrSlug);
  if (!target) {
    console.error(`error: "${idOrSlug}" matched no story id or RFC slug`);
    process.exit(1);
  }
  const file = join(TASKS_DIR, target);
  if (!existsSync(file)) {
    console.error(`error: ${file} not found`);
    process.exit(1);
  }
  const original = readFileSync(file, "utf8");

  // Temp copy keeps a `.md` extension (story slug or README.md) so the editor
  // applies markdown mode; the whole temp dir is removed in `finally`.
  const tmpRoot = mkdtempSync(join(tmpdir(), "tasks-edit-"));
  const tmpFile = join(tmpRoot, target.slice(target.lastIndexOf("/") + 1));
  const argv = editorArgv(process.env);
  let edited: string;
  try {
    writeFileSync(tmpFile, original);
    // A missing binary (ENOENT) or a non-zero editor exit (user aborted, e.g.
    // `:cq` in vim) both throw here. Surface a clean message instead of a raw
    // Node stack trace, and never commit — the canonical file is untouched.
    execFileSync(argv[0], [...argv.slice(1), tmpFile], { stdio: "inherit" });
    edited = readFileSync(tmpFile, "utf8");
  } catch (e) {
    // Clean up explicitly: process.exit() below skips any `finally`.
    rmSync(tmpRoot, { recursive: true, force: true });
    const msg = ((e as { message?: string }).message ?? String(e)).trim();
    console.error(
      `error: editor (${argv.join(" ")}) or temp-file read failed — aborting without commit: ${msg}`,
    );
    process.exit(1);
  }
  rmSync(tmpRoot, { recursive: true, force: true });

  if (edited === original) {
    console.log(`edit: ${idOrSlug} no-change`);
    return;
  }

  commitAndPush({
    message: `edit: ${idOrSlug}`,
    fileToStage: file,
    raceMessage: RETRY_MSG(idOrSlug),
    raceExitCode: 4,
    pushRefspec: TASKS_DIR_IS_SYMLINK ? "HEAD:main" : "main",
    mutator: () => {
      writeFileSync(file, edited);
      editFrontmatter(file, { updated: today() });
    },
  });
  console.log(`edit: ${idOrSlug} changed`);
}

// ──────────────────── formatter + reindex ────────────────────

// Run `prettier --write` on `files` using the tasks repo's own prettier binary
// (node_modules/.bin/prettier), so we add no runtime dep of our own. Best-effort:
// when prettier is absent (a fresh clone without the sibling tasks deps), skip
// silently — the pre-commit hook still gates formatting on commit. Relative
// paths resolve against tasksDir (prettier's cwd).
export function formatFiles(files: string[], tasksDir = TASKS_DIR): void {
  if (files.length === 0) return;
  const bin = join(tasksDir, "node_modules", ".bin", "prettier");
  if (!existsSync(bin)) return;
  execFileSync(bin, ["--write", ...files], { cwd: tasksDir, stdio: "inherit" });
}

// Rebuild index.json/index.md/search.json without a no-op mutation. The index
// otherwise only refreshes as a side effect of a committed mutation (via the
// tasks pre-commit hook) or lazily in loadIndex() when stale; after a manual
// story edit the only standalone refresh was to abuse `priority <id> N --clear`.
// This runs the same build script loadIndex() falls back to, in place.
function reindex(): void {
  inGitTasks();
  execFileSync(process.execPath, ["scripts/build-index.mjs"], {
    cwd: TASKS_DIR,
    stdio: "inherit",
  });
  console.log("rebuilt index");
}

// ──────────────────── new story ────────────────────

// Returns the cluster names declared in an RFC's README.md frontmatter, parsed
// with the same yaml.load semantics as tasks/scripts/lib.mjs (block sequences,
// flow sequences, quoted values, comments all handled). Returns [] when the
// README is missing, unparseable, or has no clusters field — the caller passes
// through, and validate.mjs will catch any structural error later.
function readRfcClusters(tasksDir: string, rfcSlug: string): string[] {
  const readmePath = join(tasksDir, "rfcs", rfcSlug, "README.md");
  let text: string;
  try {
    text = readFileSync(readmePath, "utf8");
  } catch {
    return [];
  }
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return [];
  try {
    const fm = parseYaml(fmMatch[1]) as { clusters?: unknown } | null;
    const clusters = fm?.clusters;
    if (!Array.isArray(clusters)) return [];
    return clusters.filter((c): c is string => typeof c === "string");
  } catch {
    return [];
  }
}

// Pure content generator — exported so tests can verify the exact file format
// without needing a real git repo or TASKS_DIR.
export function buildStoryContent(
  rfcSlug: string,
  storySlug: string,
  opts: {
    title?: string;
    status?: StoryStatus;
    cluster?: string | null;
    estLoc?: number | null;
    deps?: string[];
    priority?: number | null;
    body?: string;
    date: string;
  },
): string {
  // Escape for a YAML double-quoted scalar: backslash first, then double-quote.
  const qs = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const title = opts.title ?? storySlug;
  const deps = opts.deps ?? [];
  const depsYaml = deps.length === 0 ? "[]" : `[${deps.map((d) => qs(d)).join(", ")}]`;
  // A caller-supplied body (`--body-file`) replaces the empty skeleton, trimmed
  // to a single leading blank line and one trailing newline so the file is
  // prettier-clean regardless of how the source file was whitespaced.
  const body =
    opts.body != null
      ? `\n${opts.body.replace(/^\n+/, "").replace(/\n+$/, "")}\n`
      : "\n## Context\n\n## Acceptance criteria\n";
  return `---
title: ${qs(title)}
status: ${opts.status ?? "draft"}
updated: ${opts.date}
rfc: ${qs(rfcSlug)}
cluster: ${opts.cluster != null ? opts.cluster : "null"}
deps: ${depsYaml}
deps-rfc: []
est-loc: ${opts.estLoc != null ? opts.estLoc : "null"}
priority: ${opts.priority != null ? opts.priority : "null"}
pr: null
claim: null
assignee: null
blocked-by: null
---
${body}`;
}

export function newStory(
  rfcSlug: string,
  storySlug: string,
  opts: {
    title?: string;
    status?: StoryStatus;
    cluster?: string;
    estLoc?: number | null;
    deps?: string[];
    priority?: number | null;
    bodyFile?: string;
  },
  tasksDir = TASKS_DIR,
): void {
  const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
  if (!SLUG_RE.test(rfcSlug)) {
    console.error(
      `error: rfcSlug "${rfcSlug}" must be a lowercase slug (letters, digits, hyphens)`,
    );
    process.exit(1);
  }
  if (!SLUG_RE.test(storySlug)) {
    console.error(
      `error: storySlug "${storySlug}" must be a lowercase slug (letters, digits, hyphens)`,
    );
    process.exit(1);
  }
  if (opts.cluster != null && !SLUG_RE.test(opts.cluster)) {
    console.error(
      `error: cluster "${opts.cluster}" must be a lowercase slug (letters, digits, hyphens)`,
    );
    process.exit(1);
  }
  if (!existsSync(join(tasksDir, ".git"))) {
    console.error(
      `error: ${tasksDir} is not a git repo. Clone blazetrailsdev/tasks there, or set $TASKS_DIR to an existing checkout.`,
    );
    process.exit(1);
  }
  const rfcDir = join(tasksDir, "rfcs", rfcSlug);
  if (!existsSync(rfcDir)) {
    console.error(`error: RFC "${rfcSlug}" not found (expected ${rfcDir})`);
    process.exit(1);
  }
  if (opts.cluster != null) {
    const validClusters = readRfcClusters(tasksDir, rfcSlug);
    if (validClusters.length > 0 && !validClusters.includes(opts.cluster)) {
      console.error(
        `error: cluster "${opts.cluster}" is not declared in ${rfcSlug}/README.md\n` +
          `  valid clusters: ${validClusters.join(", ")}`,
      );
      process.exit(1);
    }
  }
  // Read the optional --body-file up front (before the commit loop) so a missing
  // path fails loudly rather than silently producing an empty-skeleton story.
  let body: string | undefined;
  if (opts.bodyFile != null) {
    try {
      body = readFileSync(opts.bodyFile, "utf8");
    } catch {
      console.error(`error: --body-file ${opts.bodyFile} not found or unreadable`);
      process.exit(1);
    }
  }
  const storiesDir = join(rfcDir, "stories");
  const storyFile = join(storiesDir, `${storySlug}.md`);
  if (existsSync(storyFile)) {
    console.error(`error: story "${storySlug}" already exists at ${storyFile}`);
    process.exit(1);
  }
  commitAndPush({
    message: `new: ${rfcSlug}/${storySlug}`,
    fileToStage: storyFile,
    mutator: () => {
      // Re-check after pull: another agent may have pushed the same story since
      // the pre-pull existsSync above, and writeFileSync would silently overwrite it.
      if (existsSync(storyFile)) {
        console.error(`error: story "${storySlug}" already exists (created by concurrent agent)`);
        process.exit(4);
      }
      mkdirSync(storiesDir, { recursive: true });
      writeFileSync(
        storyFile,
        buildStoryContent(rfcSlug, storySlug, { ...opts, body, date: today() }),
      );
      // Hand-authored bodies often violate prettier's wrapping rules, which the
      // tasks pre-commit hook rejects; format the file in place so the commit is
      // clean. Staged after this runs (fileToStage), so the formatted bytes land.
      formatFiles([storyFile], tasksDir);
    },
    raceMessage: `failed to create ${storySlug} after retry — pull manually and retry`,
    raceExitCode: 4,
    cwd: tasksDir,
    pushRefspec: TASKS_DIR_IS_SYMLINK ? "HEAD:main" : "main",
  });
  console.log(`created ${rfcSlug}/stories/${storySlug}.md`);
}

// ──────────────────── finalize RFC ────────────────────

// Assign a placeholder RFC (`0000-<slug>`, or legacy `draft-<slug>`) its next
// sequential number: rename the dir, rewrite every `0000-<slug>` reference and
// the README H1, strip the template's pre-merge comment, and rebuild the index
// — then commit + push via the standard loop. The rename/rewrite/strip logic is
// NOT duplicated here: it lives in the tasks repo's scripts/finalize-rfc.mjs,
// which we invoke as a subprocess (the same way reindex shells out to
// build-index.mjs). That script does no git of its own, so commitAndPush owns
// the staging — `git add -A` captures the dir rename (delete + add) plus the
// regenerated index. `--dry-run` forwards to the script, which prints the
// 0000-→NNNN- mapping and touched files without changing anything.
export function finalize(slug: string, dryRun: boolean, tasksDir = TASKS_DIR): void {
  if (!existsSync(join(tasksDir, ".git"))) {
    console.error(
      `error: ${tasksDir} is not a git repo. Clone blazetrailsdev/tasks there, or set $TASKS_DIR to an existing checkout.`,
    );
    process.exit(1);
  }
  const prefix = slug.startsWith("0000-") ? "0000-" : slug.startsWith("draft-") ? "draft-" : null;
  if (!prefix || slug.length === prefix.length) {
    console.error(
      `error: "${slug}" is not a placeholder RFC — expected a "0000-<slug>" (or legacy "draft-<slug>") dir`,
    );
    process.exit(1);
  }
  const dir = join(tasksDir, "rfcs", slug);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`error: no such placeholder RFC dir: rfcs/${slug}`);
    process.exit(1);
  }
  if (dryRun) {
    execFileSync(process.execPath, ["scripts/finalize-rfc.mjs", slug, "--dry-run"], {
      cwd: tasksDir,
      stdio: "inherit",
    });
    return;
  }
  commitAndPush({
    message: `finalize: ${slug}`,
    fileToStage: "-A",
    raceMessage: `lost finalize race on ${slug} — pull manually and retry`,
    raceExitCode: 4,
    cwd: tasksDir,
    pushRefspec: TASKS_DIR_IS_SYMLINK ? "HEAD:main" : "main",
    mutator: () => {
      // Re-check after the pull: a concurrent finalize may have already numbered
      // and renamed this dir away, in which case there is nothing left to do.
      if (!existsSync(dir)) {
        console.error(`error: rfcs/${slug} no longer exists (finalized by a concurrent agent?)`);
        process.exit(4);
      }
      // Rename + rewrite + strip + rebuild index in place (no git of its own).
      execFileSync(process.execPath, ["scripts/finalize-rfc.mjs", slug], {
        cwd: tasksDir,
        stdio: "inherit",
      });
    },
  });
  console.log(`finalized ${slug}`);
}

// ──────────────────── done merge-state guard ────────────────────

// Guards `done` against marking an OPEN PR as done. Exported for unit tests.
// MERGED and CLOSED are both allowed (CLOSED covers spikes and moot-audit PRs
// that are intentionally not merged). Only OPEN is rejected: the work is
// unfinished. Exits 1 on OPEN or if gh is unavailable.
export function checkPrNotOpen(pr: number): void {
  let raw: string;
  try {
    raw = execFileSync("gh", ["pr", "view", String(pr), "--json", "state"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const msg = ((e as { stderr?: string }).stderr ?? String(e)).trim();
    console.error(`error: could not query PR #${pr} state via gh: ${msg}`);
    process.exit(1);
  }
  let data: { state?: string } = {};
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    console.error(`error: unexpected output from gh pr view #${pr}`);
    process.exit(1);
  }
  if (!data.state) {
    console.error(`error: could not read PR #${pr} state from gh output`);
    process.exit(1);
  }
  if (data.state === "OPEN") {
    console.error(
      `error: PR #${pr} is still open — merge or close it first, or use --force to bypass`,
    );
    process.exit(1);
  }
}

// ──────────────────── presentation ────────────────────

// One-line legend printed above every story table so the priority column's
// direction is documented wherever the ordering is shown (`ready`, `list`,
// `next-bundle`). Ties at the same priority have no defined order.
export const PRIORITY_LEGEND =
  "priority: lower N = higher priority; absent = unprioritized; ties have undefined order";

// Pure renderer for the story table — exported so tests can assert column
// content (e.g. est_loc rendered from a numeric value, priority shown) without
// capturing stdout. `null` cells render as an em dash.
export function formatRows(rows: StoryEntry[]): string {
  if (!rows.length) return "(none)";
  const cols = ["id", "rfc", "status", "priority", "est_loc", "cluster"] as const;
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? "—").length)),
  );
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  return [
    PRIORITY_LEGEND,
    line([...cols]),
    ...rows.map((r) => line(cols.map((c) => String(r[c] ?? "—")))),
  ].join("\n");
}

function fmt(rows: StoryEntry[]): void {
  console.log(formatRows(rows));
}

// Pure renderer for `show <id>`: the resolved file path followed by the story's
// full text (frontmatter + body). Exported for unit testing without a checkout.
export function renderStoryView(filePath: string, text: string): string {
  return `${filePath}\n\n${text.trimEnd()}`;
}

function showStory(index: Index, id: string): void {
  const entry = index.stories.find((s) => s.id === id);
  if (!entry) {
    console.error(`error: story "${id}" not found in index`);
    process.exit(1);
  }
  const file = join(TASKS_DIR, entry.file_path);
  if (!existsSync(file)) {
    // Index is ahead of disk (e.g. a deleted story still in a stale index).
    // Surface it cleanly rather than letting readFileSync throw a raw ENOENT.
    console.error(`error: story "${id}" is indexed at ${entry.file_path} but the file is missing`);
    process.exit(1);
  }
  console.log(renderStoryView(entry.file_path, readFileSync(file, "utf8")));
}

function statusCounts(index: Index): void {
  const byRfc = new Map<string, Record<string, number>>();
  for (const s of index.stories) {
    const row = byRfc.get(s.rfc) ?? Object.fromEntries(STORY_STATUSES.map((k) => [k, 0]));
    if (s.status) row[s.status] = (row[s.status] ?? 0) + 1;
    byRfc.set(s.rfc, row);
  }
  const totals = Object.fromEntries(STORY_STATUSES.map((k) => [k, 0]));
  for (const row of byRfc.values()) for (const k of STORY_STATUSES) totals[k] += row[k];
  const header = ["RFC", ...STORY_STATUSES];
  const rows = [...byRfc.entries()]
    .sort()
    .map(([rfc, row]) => [rfc, ...STORY_STATUSES.map((k) => String(row[k]))]);
  rows.push(["TOTAL", ...STORY_STATUSES.map((k) => String(totals[k]))]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(line(header));
  for (const r of rows) console.log(line(r));
}

// ──────────────────── argv ────────────────────

// Reject `--foo` for a value-flag where no value followed (the parser
// fell back to `true`). `Number(true)` is `1`, which silently passes
// `if (!pr)` checks; coerce-and-validate at the call site instead.
export function numberFlag(flags: Record<string, string | boolean>, name: string): number | null {
  const v = flags[name];
  if (typeof v !== "string" || !/^\d+$/.test(v)) return null;
  return Number(v);
}

export function stringFlag(
  flags: Record<string, string | boolean>,
  name: string,
): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}

// Known boolean flags. Everything else with a non-`--` following token
// is treated as `--key value`. Boolean flags never consume the next
// token, removing the `--json <id>` ambiguity.
const BOOLEAN_FLAGS = new Set(["json", "clear", "force", "dry-run"]);

export function parseFlags(
  args: string[],
  booleanFlags: ReadonlySet<string> = BOOLEAN_FLAGS,
): {
  flags: Record<string, string | boolean>;
  rest: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (booleanFlags.has(key)) {
        flags[key] = true;
        continue;
      }
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      rest.push(a);
    }
  }
  return { flags, rest };
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, rest: pos } = parseFlags(rest);
  // `flags[k] === true` means the user wrote `--k` with no following
  // value. For value-flags that's a usage error, not a boolean.
  const valueFlags = [
    "rfc",
    "cluster",
    "status",
    "max-loc",
    "pr",
    "assignee",
    "reason",
    "dir",
    "title",
    "est-loc",
    "deps",
    "priority",
    "body-file",
    "supersede",
    "relate",
    "clusters",
    "packages",
  ];
  for (const k of valueFlags) if (flags[k] === true) usage();

  switch (cmd) {
    case "ready": {
      syncFromOrigin();
      const rows = ready(loadIndex(), { rfc: stringFlag(flags, "rfc") });
      flags.json ? console.log(JSON.stringify(rows, null, 2)) : fmt(rows);
      break;
    }
    case "next-bundle": {
      syncFromOrigin();
      const maxLocRaw = stringFlag(flags, "max-loc") ?? "250";
      if (!/^\d+$/.test(maxLocRaw) || Number(maxLocRaw) <= 0) usage();
      const maxLoc = Number(maxLocRaw);
      const rows = nextBundle(loadIndex(), {
        maxLoc,
        cluster: stringFlag(flags, "cluster"),
        rfc: stringFlag(flags, "rfc"),
      });
      const total = rows.reduce((a, s) => a + (s.est_loc ?? 0), 0);
      if (flags.json) {
        console.log(
          JSON.stringify({ stories: rows, bundle_total_loc: total, max_loc: maxLoc }, null, 2),
        );
      } else if (rows.length === 0) {
        console.log(`no ready stories within ${maxLoc} LOC`);
      } else {
        console.log(`bundle (sum ${total} / max ${maxLoc}):`);
        fmt(rows);
      }
      break;
    }
    case "list": {
      syncFromOrigin();
      const rows = listFiltered(loadIndex(), {
        rfc: stringFlag(flags, "rfc"),
        status: stringFlag(flags, "status"),
        cluster: stringFlag(flags, "cluster"),
      });
      flags.json ? console.log(JSON.stringify(rows, null, 2)) : fmt(rows);
      break;
    }
    case "show": {
      const id = pos[0];
      if (!id) usage();
      syncFromOrigin();
      showStory(loadIndex(), id);
      break;
    }
    case "status":
      syncFromOrigin();
      statusCounts(loadIndex());
      break;
    case "claim": {
      const id = pos[0];
      const assignee = stringFlag(flags, "assignee");
      if (!id) usage();
      claim(id, assignee ?? id);
      break;
    }
    case "in-progress": {
      const id = pos[0];
      const pr = numberFlag(flags, "pr");
      if (!id || pr === null) usage();
      inProgress(id, pr);
      break;
    }
    case "done": {
      const id = pos[0];
      const pr = numberFlag(flags, "pr");
      if (!id || pr === null) usage();
      if (!flags.force) checkPrNotOpen(pr);
      done(id, pr);
      break;
    }
    case "new": {
      const rfcSlug = pos[0];
      const storySlug = pos[1];
      if (!rfcSlug || !storySlug) usage();
      const estLocRaw = stringFlag(flags, "est-loc");
      if (estLocRaw !== undefined && (!/^\d+$/.test(estLocRaw) || Number(estLocRaw) <= 0)) usage();
      const priorityRaw = stringFlag(flags, "priority");
      if (priorityRaw !== undefined && !/^\d+$/.test(priorityRaw)) usage();
      const statusRaw = stringFlag(flags, "status");
      if (statusRaw !== undefined && !STORY_STATUSES.includes(statusRaw as StoryStatus)) usage();
      const depsRaw = stringFlag(flags, "deps");
      newStory(rfcSlug, storySlug, {
        title: stringFlag(flags, "title"),
        status: statusRaw as StoryStatus | undefined,
        cluster: stringFlag(flags, "cluster"),
        estLoc: estLocRaw !== undefined ? Number(estLocRaw) : null,
        deps: depsRaw
          ? depsRaw
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean)
          : [],
        priority: priorityRaw !== undefined ? Number(priorityRaw) : null,
        bodyFile: stringFlag(flags, "body-file"),
      });
      break;
    }
    case "finalize": {
      const slug = pos[0];
      if (!slug) usage();
      finalize(slug, flags["dry-run"] === true);
      break;
    }
    case "reindex":
    case "build":
      reindex();
      break;
    case "fmt": {
      // Format the given paths (relative to TASKS_DIR), or all RFC markdown when
      // none are named. Leaves hand-authored stories prettier-clean for commit.
      inGitTasks();
      formatFiles(pos.length > 0 ? pos : ["rfcs"]);
      console.log("formatted");
      break;
    }
    case "block": {
      const id = pos[0];
      const reason = stringFlag(flags, "reason") ?? pos[1];
      if (!id || !reason) usage();
      block(id, reason);
      break;
    }
    case "refine": {
      const id = pos[0];
      if (!id) usage();
      // --pr is optional here: present ⇒ also flip the story to done.
      // --dir is the agent's tasks worktree; defaults to the canonical checkout.
      const refinePr = numberFlag(flags, "pr");
      if (refinePr !== null && !flags.force) checkPrNotOpen(refinePr);
      refine(id, refinePr, stringFlag(flags, "dir") ?? TASKS_DIR);
      break;
    }
    case "edit": {
      const id = pos[0];
      if (!id) usage();
      edit(id);
      break;
    }
    case "priority": {
      const id = pos[0];
      if (!id) usage();
      if (flags.clear) {
        setPriority(id, null);
      } else {
        // Positional integer; lower = higher priority. Reject non-integers and
        // negatives so a typo can't write a value `validate.mjs` will reject.
        const n = pos[1];
        if (n === undefined || !/^\d+$/.test(n)) usage();
        setPriority(id, Number(n));
      }
      break;
    }
    case "status-set": {
      const id = pos[0];
      const target = pos[1];
      if (!id || !target || !STORY_STATUSES.includes(target as StoryStatus)) usage();
      setStatus(id, target as StoryStatus);
      break;
    }
    case "rfc": {
      const slug = pos[0];
      if (!slug) usage();
      rfc(slug, {
        status: stringFlag(flags, "status"),
        supersede: stringFlag(flags, "supersede"),
        relate: stringFlag(flags, "relate"),
        clusters: stringFlag(flags, "clusters"),
        packages: stringFlag(flags, "packages"),
      });
      break;
    }
    default:
      usage();
  }
}

function usage(): never {
  console.error(`usage: pnpm tasks <command>

  ready [--json] [--rfc <slug>]
  next-bundle [--max-loc N] [--cluster <name>] [--rfc <slug>] [--json]
  list [--rfc <slug>] [--status <v>] [--cluster <n>] [--json]
  show <id>
  status

  claim <id> [--assignee <name>]
  in-progress <id> --pr <N>
  done <id> --pr <N> [--force]
  block <id> --reason "<text>"
  refine <id> [--pr <N>] [--dir <tasks worktree>] [--force]
  edit <id-or-rfc-slug>                        ($EDITOR body edit for a story or RFC README)
  priority <id> <N> | priority <id> --clear    (lower N = higher priority)
  status-set <id> <status>                     (draft ↔ ready, blocked → ready; validates the transition)
  rfc <slug> [--status <s>] [--supersede <other-slug>] [--relate <csv>] [--clusters <csv>] [--packages <csv>]
  new <rfc-slug> <story-slug> [--title "text"] [--status <v>] [--cluster <name>] [--est-loc <N>] [--deps <csv>] [--priority <N>] [--body-file <path>]
  finalize <0000-slug> [--dry-run]             (assign the next RFC number: rename dir, rewrite refs, rebuild index)
  reindex | build                              (rebuild the index in place)
  fmt [<path> ...]                             (prettier --write authored stories; default: rfcs/)

Set $TASKS_DIR to override the default ~/github/blazetrailsdev/tasks.
($RFCS_DIR is honored as a transition fallback after the rfcs → tasks rename.)`);
  process.exit(2);
}

// CLI entry — only runs when this module is the script entrypoint, not
// when imported (e.g. by the smoke test). Matches the pattern used by
// scripts/fixtures-compare/compare.ts and scripts/api-compare/lint-deps.ts.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
