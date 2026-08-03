// A deviation comment that names the story which will converge it is a promise
// nothing checks. `activesupport-json-encoding-time-precision` landed as #5971
// while `message-verifier.test.ts` still asserted the pre-convergence value,
// and the break surfaced only as a red Unit Tests lane on main (#5976).
//
// This module extracts those promises — a story slug sitting in the same
// comment sentence as a forward-looking phrase — so a landed story with a
// still-pending citation fails a test instead of a suite. Markdown prose names
// landed stories the same way, so `.md` under the trails tree is scanned too.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Three or more kebab segments: two-segment names collide with ordinary prose
// ("has-one", "type-map") far too often to be worth matching.
const STORY_SLUG = /[a-z0-9]+(?:-[a-z0-9]+){2,}/g;

const PENDING_PHRASE =
  /converged by|converges (when|in|once)|will (be )?converge|deferred to|pending convergence|once .{0,40}lands|until .{0,60}lands|un-?skip once|when that story|fixed by|tracked (by|to|in|here|separately)|known gap|TODO\(/i;

const PROVENANCE_PHRASE = /regression for|\blanded\b|added by|introduced by|ported in/i;

// Frontmatter `status:` of a story file, matched before any body prose.
const STORY_STATUS = /^status:\s*"?([a-z-]+)"?\s*$/m;

const COMMENT_LINE = /^\s*(?:\/\/|\/\*+|\*)(.*)$/;
const SENTENCE = /(?<=[.;:)])\s+(?=[A-Z(`])|\.\s+/;
const CODE_FENCE = /^\s*(?:```|~~~)/;

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "vendor", "__snapshots__"]);
const SOURCE_ROOTS = ["packages", "scripts", "eslint"];

const MARKDOWN_SKIP_DIRS = new Set([...SKIP_DIRS, "tasks"]);
// Frozen by RFC 0011 Phase 4: CI's `Docs ActiveRecord Freeze` job fails any PR
// that edits a file here, so a stale citation in this tree has no legal fix and
// cannot be gated. It is scanned as an inventory instead.
const FROZEN_MARKDOWN_TREES = [path.join("docs", "activerecord")];

// Its test states a stale promise verbatim as a fixture, and the line-based
// scan reads that template literal as a real comment.
const SKIP_FILES = new Set([path.join("scripts", "stale-story-references.test.ts")]);

export interface StoryReference {
  file: string;
  line: number;
  slug: string;
}

interface Block {
  line: number;
  text: string[];
}

/**
 * Story slugs cited as still-pending in `source`'s comments. Contiguous comment
 * lines form one block, and the promise is matched over the whole block: a
 * paragraph routinely states the gap in one sentence and names its story in the
 * next ("… it falls back. Tracked by `X`."), which a sentence-scoped match
 * misses entirely.
 *
 * A `PROVENANCE_PHRASE` sentence is then vetoed per sentence rather than per
 * block, so a block that makes a promise does not drag its own history
 * citations in with it: the match is block-scoped, the exemption stays
 * sentence-scoped. That keeps "Regression for X" legal alongside a promise, and
 * keeps a citation of the story that already landed ("`X` landed (#3874)
 * without closing it") from reading as the promise it disclaims.
 */
export function extractStoryReferences(source: string, file: string): StoryReference[] {
  const blocks: Block[] = [];
  let block: Block | undefined;
  source.split("\n").forEach((line, i) => {
    const match = COMMENT_LINE.exec(line);
    if (!match) {
      block = undefined;
      return;
    }
    if (!block) blocks.push((block = { line: i + 1, text: [] }));
    block.text.push(match[1].trim());
  });
  return blockReferences(blocks, file);
}

/**
 * The same promises in markdown prose. Every line is prose, so a block is a
 * paragraph — blank-line separated — rather than a run of comment lines, and
 * fenced code is skipped so an example comment quoted in a fence is not read
 * as a real promise.
 */
export function extractMarkdownStoryReferences(source: string, file: string): StoryReference[] {
  const blocks: Block[] = [];
  let block: Block | undefined;
  let fenced = false;
  source.split("\n").forEach((line, i) => {
    if (CODE_FENCE.test(line)) {
      fenced = !fenced;
      block = undefined;
      return;
    }
    if (fenced || line.trim() === "") {
      block = undefined;
      return;
    }
    if (!block) blocks.push((block = { line: i + 1, text: [] }));
    block.text.push(line.trim());
  });
  return blockReferences(blocks, file);
}

/**
 * The pending citations in each block: the promise is matched over the whole
 * block, and a `PROVENANCE_PHRASE` sentence is then vetoed per sentence.
 */
function blockReferences(blocks: readonly Block[], file: string): StoryReference[] {
  const refs: StoryReference[] = [];
  for (const block of blocks) {
    const text = block.text.join(" ");
    if (!PENDING_PHRASE.test(text)) continue;
    for (const sentence of text.split(SENTENCE)) {
      if (PROVENANCE_PHRASE.test(sentence)) continue;
      for (const slug of new Set(sentence.match(STORY_SLUG) ?? [])) {
        refs.push({ file, line: block.line, slug });
      }
    }
  }
  return refs;
}

/** Repo-relative `.ts`/`.mjs` paths under `dir`. */
export async function collectSourceFiles(
  root: string,
  dir = root,
  acc: string[] = [],
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await collectSourceFiles(root, abs, acc);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".mjs")) {
      acc.push(path.relative(root, abs));
    }
  }
  return acc;
}

/**
 * Repo-relative `.md` paths under `dir` — the trails tree only. `tasks/` is a
 * checkout of the tasks repo (a symlink in agent worktrees, so it is never
 * walked as a directory anyway; the name is excluded so a plain checkout
 * behaves the same way) whose story files legitimately cite landed stories as
 * dependencies and provenance. The frozen trees are left to
 * `collectFrozenMarkdownFiles` — a finding there could not be resolved by
 * correcting the prose, so it is inventoried rather than gated.
 */
export async function collectMarkdownFiles(
  root: string,
  dir = root,
  acc: string[] = [],
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs);
    if (FROZEN_MARKDOWN_TREES.includes(rel)) continue;
    if (entry.isDirectory()) {
      if (!MARKDOWN_SKIP_DIRS.has(entry.name)) await collectMarkdownFiles(root, abs, acc);
    } else if (entry.name.endsWith(".md")) {
      acc.push(rel);
    }
  }
  return acc;
}

/**
 * Repo-relative `.md` paths under the frozen trees `collectMarkdownFiles`
 * leaves out — the population the inventory covers.
 */
export async function collectFrozenMarkdownFiles(root: string): Promise<string[]> {
  const acc: string[] = [];
  for (const tree of FROZEN_MARKDOWN_TREES) {
    await collectMarkdownFiles(root, path.join(root, tree), acc);
  }
  return acc;
}

/**
 * Every pending citation in the frozen trees. This is an inventory, not a gate:
 * the prose cannot legally be edited, so a finding here is a note for the
 * freeze cutover rather than a failure. Kept out of `scanStoryReferences` so
 * the hard gate stays scoped to the editable tree.
 */
export async function scanFrozenStoryReferences(repoRoot: string): Promise<StoryReference[]> {
  const refs: StoryReference[] = [];
  for (const file of await collectFrozenMarkdownFiles(repoRoot)) {
    refs.push(
      ...extractMarkdownStoryReferences(await readFile(path.join(repoRoot, file), "utf8"), file),
    );
  }
  return refs;
}

/** Every pending citation in the source roots this check covers. */
export async function scanStoryReferences(repoRoot: string): Promise<StoryReference[]> {
  const refs: StoryReference[] = [];
  for (const root of SOURCE_ROOTS) {
    for (const file of await collectSourceFiles(repoRoot, path.join(repoRoot, root))) {
      if (SKIP_FILES.has(file)) continue;
      refs.push(...extractStoryReferences(await readFile(path.join(repoRoot, file), "utf8"), file));
    }
  }
  for (const file of await collectMarkdownFiles(repoRoot)) {
    refs.push(
      ...extractMarkdownStoryReferences(await readFile(path.join(repoRoot, file), "utf8"), file),
    );
  }
  return refs;
}

export interface IndexStory {
  id: string;
  status: string;
}

/**
 * Every story's own status, read from the frontmatter under
 * `<tasksDir>/rfcs/*\/stories/*.md`. The tracked markdown is the source of
 * truth: `index.json` is a gitignored cache, absent in a fresh checkout, and
 * the status it serves is demoted to the RFC's whenever that RFC is closed —
 * which would hide a landed story behind an RFC-level state. Throws when
 * `tasksDir` holds no stories, so a missing tasks checkout reds this check
 * rather than silently retiring it.
 */
export async function loadStories(tasksDir: string): Promise<IndexStory[]> {
  const stories: IndexStory[] = [];
  const rfcsDir = path.join(tasksDir, "rfcs");
  let rfcs: string[];
  try {
    rfcs = await readdir(rfcsDir);
  } catch {
    throw new Error(`no tasks checkout at ${tasksDir} — cannot resolve story statuses`);
  }
  for (const rfc of rfcs) {
    const dir = path.join(rfcsDir, rfc, "stories");
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const status = STORY_STATUS.exec(await readFile(path.join(dir, entry), "utf8"))?.[1];
      if (status) stories.push({ id: entry.slice(0, -3), status });
    }
  }
  if (stories.length === 0) {
    throw new Error(`no stories under ${rfcsDir} — cannot resolve story statuses`);
  }
  return stories;
}

/**
 * The citations whose story has already landed. A slug no story claims is not a
 * story reference at all (kebab file names, Rails option names), so it is never
 * a finding.
 */
export function staleStoryReferences(
  refs: readonly StoryReference[],
  stories: readonly IndexStory[],
): StoryReference[] {
  const byId = new Map(stories.map((story) => [story.id, story]));
  return refs.filter((ref) => {
    const status = byId.get(ref.slug)?.status;
    return status === "done" || status === "closed";
  });
}
