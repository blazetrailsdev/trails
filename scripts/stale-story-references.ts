// A deviation comment that names the story which will converge it is a promise
// nothing checks. `activesupport-json-encoding-time-precision` landed as #5971
// while `message-verifier.test.ts` still asserted the pre-convergence value,
// and the break surfaced only as a red Unit Tests lane on main (#5976).
//
// This module extracts those promises — a story slug sitting in the same
// comment sentence as a forward-looking phrase — so a landed story with a
// still-pending citation fails a test instead of a suite.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Three or more kebab segments: two-segment names collide with ordinary prose
// ("has-one", "type-map") far too often to be worth matching.
const STORY_SLUG = /[a-z0-9]+(?:-[a-z0-9]+){2,}/g;

const PENDING_PHRASE =
  /converged by|converges (when|in|once)|will (be )?converge|deferred to|pending convergence|once .{0,40}lands|until .{0,60}lands|un-?skip once|when that story|fixed by|tracked (by|to|in|here|separately)|known gap|TODO\(/i;

// A slug in a sentence that reports history rather than a promise. The pending
// phrase is matched over the whole comment block (below), so this is what keeps
// "Regression for X" legal in a block whose *other* sentence makes a promise —
// and what keeps a citation of the story that already landed ("`X` landed
// (#3874) without closing it") from reading as the promise it disclaims.
const PROVENANCE_PHRASE = /regression for|\blanded\b|added by|introduced by|ported in/i;

// Frontmatter `status:` of a story file, matched before any body prose.
const STORY_STATUS = /^status:\s*"?([a-z-]+)"?\s*$/m;

const COMMENT_LINE = /^\s*(?:\/\/|\/\*+|\*)(.*)$/;
const SENTENCE = /(?<=[.;:)])\s+(?=[A-Z(`])|\.\s+/;

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "vendor", "__snapshots__"]);
const SOURCE_ROOTS = ["packages", "scripts", "eslint"];

// Its test states a stale promise verbatim as a fixture, and the line-based
// scan reads that template literal as a real comment.
const SKIP_FILES = new Set([path.join("scripts", "stale-story-references.test.ts")]);

export interface StoryReference {
  file: string;
  line: number;
  slug: string;
}

/**
 * Story slugs cited as still-pending in `source`'s comments. Contiguous comment
 * lines form one block, and the promise is matched over the whole block: a
 * paragraph routinely states the gap in one sentence and names its story in the
 * next ("… it falls back. Tracked by `X`."), which a sentence-scoped match
 * misses entirely.
 *
 * Provenance is then vetoed per sentence rather than per block, so a block that
 * makes a promise does not drag its own history citations in with it — the
 * match is block-scoped, the exemption stays sentence-scoped.
 */
export function extractStoryReferences(source: string, file: string): StoryReference[] {
  const refs: StoryReference[] = [];
  const lines = source.split("\n");
  let block: string[] = [];
  let start = 0;
  const flush = (): void => {
    if (block.length === 0) return;
    const text = block.join(" ");
    if (PENDING_PHRASE.test(text)) {
      for (const sentence of text.split(SENTENCE)) {
        if (PROVENANCE_PHRASE.test(sentence)) continue;
        for (const slug of new Set(sentence.match(STORY_SLUG) ?? [])) {
          refs.push({ file, line: start, slug });
        }
      }
    }
    block = [];
  };
  lines.forEach((line, i) => {
    const match = COMMENT_LINE.exec(line);
    if (match) {
      if (block.length === 0) start = i + 1;
      block.push(match[1].trim());
    } else {
      flush();
    }
  });
  flush();
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

/** Every pending citation in the source roots this check covers. */
export async function scanStoryReferences(repoRoot: string): Promise<StoryReference[]> {
  const refs: StoryReference[] = [];
  for (const root of SOURCE_ROOTS) {
    for (const file of await collectSourceFiles(repoRoot, path.join(repoRoot, root))) {
      if (SKIP_FILES.has(file)) continue;
      refs.push(...extractStoryReferences(await readFile(path.join(repoRoot, file), "utf8"), file));
    }
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
