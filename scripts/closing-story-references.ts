// `stale-story-references` judges a landed story's citations, but a story lands
// only AFTER the merge: `.claude/skills/post-merge-findings/run.sh` parses the
// `Closes-story:` trailers out of a MERGED PR body and runs `pnpm tasks done`.
// So a PR that closes a story is structurally blind to the check that judges it
// seconds later — its own CI sees the story still in progress, passes, merges,
// and main goes red with no commit in between (#7083 for #7077;
// #5976 for #5971).
//
// This module closes that window by moving the judgement to PR time: a PR whose
// body declares `Closes-story: <id>` must carry no pending citation of `<id>`
// anywhere in the tree. The citation scan is `scanStoryReferences` verbatim, so
// a finding here is a guaranteed red on main — there is no new false-positive
// class, and no judgement call in the message.

import { pathToFileURL } from "node:url";

import { scanStoryReferences, type StoryReference } from "./stale-story-references.js";

// The one definition of the trailer shape. `post-merge-findings/run.sh` matches
// the same shape with `grep -oiE 'Closes-story:[[:space:]]*[a-z0-9][a-z0-9-]*'`,
// so the gate and the marker can never disagree about what a PR closes.
const CLOSES_STORY = /^[^\S\n]*closes-story:[^\S\n]*([a-z0-9][a-z0-9-]*)[^\S\n]*$/gim;

/**
 * Every story id a PR body declares closed, in order and de-duplicated. A
 * bundle PR carries one trailer per story, so all of them count — taking only
 * the first is the bug run.sh already had to fix.
 */
export function closesStoryIds(prBody: string): string[] {
  const ids = new Set<string>();
  for (const match of prBody.matchAll(CLOSES_STORY)) ids.add(match[1].toLowerCase());
  return [...ids];
}

/**
 * The citations this PR must clear before it merges: a pending promise naming a
 * story the same PR declares closed. A citation of a story the PR does NOT
 * close is somebody else's problem and stays green.
 */
export function closingStoryReferences(
  refs: readonly StoryReference[],
  closingIds: ReadonlySet<string>,
): StoryReference[] {
  return refs.filter((ref) => closingIds.has(ref.slug));
}

/** Every pending citation of a story `prBody` declares closed. */
export async function scanClosingStoryReferences(
  repoRoot: string,
  prBody: string,
): Promise<StoryReference[]> {
  const closingIds = new Set(closesStoryIds(prBody));
  if (closingIds.size === 0) return [];
  return closingStoryReferences(await scanStoryReferences(repoRoot), closingIds);
}

/**
 * The human-readable failure. Both legal fixes are named because there is no
 * third one: the citation either belongs to the story that owns the remaining
 * work now, or it belongs to nothing.
 */
export function formatFindings(findings: readonly StoryReference[]): string {
  const lines = findings.map((f) => `  ${f.file}:${f.line} — cites \`${f.slug}\``);
  return [
    "This PR declares it closes these stories, but still promises work to them:",
    ...lines,
    "",
    "Fix one of two ways, before the merge:",
    "  - re-point the citation at the story that owns that work now, or",
    "  - delete the citation.",
    "",
    "Left as-is, `stale-story-references` reds Unit Tests on main the moment",
    "post-merge-findings marks the story done.",
  ].join("\n");
}

/**
 * The PR body to judge. `--pr N` reads the live body through `gh` — the same
 * source `run.sh` reads, so the gate sees the trailers a body edit added after
 * the last CI run. With no `--pr`, the branch's own commit messages stand in,
 * which is what an agent has locally before the PR exists.
 */
async function resolveBody(argv: readonly string[]): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const prIndex = argv.indexOf("--pr");
  const pr = prIndex === -1 ? undefined : argv[prIndex + 1];
  const cmd = pr
    ? (["gh", ["pr", "view", pr, "--json", "body", "--jq", ".body"]] as const)
    : (["git", ["log", "--format=%B", "origin/main..HEAD"]] as const);
  const { stdout } = await run(cmd[0], [...cmd[1]]);
  return stdout;
}

export async function main(argv: readonly string[], repoRoot: string): Promise<number> {
  const findings = await scanClosingStoryReferences(repoRoot, await resolveBody(argv));
  if (findings.length === 0) {
    console.log("No pending citations of a story this PR closes.");
    return 0;
  }
  console.error(formatFindings(findings));
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main(process.argv.slice(2), process.cwd()).then((code) => {
    process.exitCode = code;
  });
}
