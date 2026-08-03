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

// A story id: three or more kebab segments. Two-segment names collide with
// ordinary prose ("has-one", "type-map") far too often to be worth matching.
const STORY_SLUG = /[a-z0-9]+(?:-[a-z0-9]+){2,}/g;

// Phrasings that promise future convergence. A slug cited as provenance
// ("Regression for X", "story: X") is history, not a promise, and stays legal
// after the story lands.
const PENDING_PHRASE =
  /converged by|converges (when|in|once)|will (be )?converge|deferred to|pending convergence|once .{0,40}lands|until .{0,60}lands|un-?skip once|when that story|fixed by/i;

const COMMENT_LINE = /^\s*(?:\/\/|\/\*+|\*)(.*)$/;
const SENTENCE = /(?<=[.;:)])\s+(?=[A-Z(`])|\.\s+/;

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "vendor", "__snapshots__"]);
const SOURCE_ROOTS = ["packages", "scripts", "eslint"];

// This check's own test states a stale promise verbatim as its fixture; the
// scan is line-based, so the fixture inside a template literal reads as a real
// comment.
const SKIP_FILES = new Set([path.join("scripts", "stale-story-references.test.ts")]);

export interface StoryReference {
  file: string;
  line: number;
  slug: string;
}

// Contiguous comment lines form one block: a promise and its slug routinely sit
// on different physical lines of the same JSDoc paragraph.
export function extractStoryReferences(source: string, file: string): StoryReference[] {
  const refs: StoryReference[] = [];
  const lines = source.split("\n");
  let block: string[] = [];
  let start = 0;
  const flush = (): void => {
    if (block.length === 0) return;
    for (const sentence of block.join(" ").split(SENTENCE)) {
      if (!PENDING_PHRASE.test(sentence)) continue;
      for (const slug of new Set(sentence.match(STORY_SLUG) ?? [])) {
        refs.push({ file, line: start, slug });
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

export async function collectSourceFiles(root: string, dir = root, acc: string[] = []) {
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
  // The story's own status; `status` is demoted to its RFC's when the RFC is
  // closed, which would hide a landed story behind an rfc-level state.
  raw_status?: string;
}

// A slug the index doesn't know is not a story reference at all (kebab file
// names, CSS-ish identifiers, Rails option names), so it is never a finding.
export function staleStoryReferences(
  refs: readonly StoryReference[],
  stories: readonly IndexStory[],
): StoryReference[] {
  const byId = new Map(stories.map((story) => [story.id, story]));
  return refs.filter((ref) => {
    const story = byId.get(ref.slug);
    if (!story) return false;
    const status = story.raw_status ?? story.status;
    return status === "done" || status === "closed";
  });
}
