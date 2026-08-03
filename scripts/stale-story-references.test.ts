import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractStoryReferences,
  scanStoryReferences,
  staleStoryReferences,
  type IndexStory,
} from "./stale-story-references.js";
import { resolveTasksDir } from "./tasks/cli.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The exact comment message-verifier.test.ts carried until #5976.
const LANDED_PROMISE = `
    // Trails' encoder has no \`time_precision\` knob and leans on
    // \`Temporal.Instant#toJSON\`, which drops a zero subsecond part.
    // Converged by the \`activesupport-json-encoding-time-precision\` story.
    const exp = { foo: 123, bar: "2010-01-01T00:00:00Z" };
`;

const STORIES: IndexStory[] = [
  { id: "activesupport-json-encoding-time-precision", status: "done", raw_status: "done" },
  { id: "converge-connection-pool-lifecycle-async", status: "ready", raw_status: "ready" },
  // A done story under a closed RFC: `status` is demoted, `raw_status` is not.
  { id: "cache-entry-remaining-methods", status: "closed", raw_status: "done" },
];

describe("stale story references", () => {
  it("flags a pending citation of a story that has landed", () => {
    const refs = extractStoryReferences(LANDED_PROMISE, "message-verifier.test.ts");
    expect(refs.map((ref) => ref.slug)).toContain("activesupport-json-encoding-time-precision");
    expect(staleStoryReferences(refs, STORIES)).toHaveLength(1);
  });

  it("leaves a pending citation of a story that has not landed", () => {
    const refs = extractStoryReferences(
      "// (Lifecycle-path async convergence is deferred to\n// `converge-connection-pool-lifecycle-async`.)\n",
      "connection-pool.ts",
    );
    expect(refs).toHaveLength(1);
    expect(staleStoryReferences(refs, STORIES)).toEqual([]);
  });

  it("reads the story's own status, not the one its RFC demotes it to", () => {
    const refs = extractStoryReferences(
      "// Remaining wiring is pending convergence by `cache-entry-remaining-methods`.\n",
      "coder.ts",
    );
    expect(staleStoryReferences(refs, STORIES)).toHaveLength(1);
  });

  it("ignores a slug cited as provenance rather than as a promise", () => {
    const refs = extractStoryReferences(
      "// Regression for `activesupport-json-encoding-time-precision`: the encoder\n// emits three subsecond digits.\n",
      "json.test.ts",
    );
    expect(refs).toEqual([]);
  });

  it("ignores kebab identifiers that name no story", () => {
    const refs = extractStoryReferences(
      "// Converged by the `some-thing-that-is-not-a-story` rewrite.\n",
      "x.ts",
    );
    expect(staleStoryReferences(refs, STORIES)).toEqual([]);
  });

  it("only reads comment text", () => {
    expect(
      extractStoryReferences('const msg = "converged by cache-entry-remaining-methods";', "x.ts"),
    ).toEqual([]);
  });

  // The tasks repo is not checked out in CI, so the tree-wide gate is the
  // pre-push signal here and in every agent worktree (start-worktree.sh
  // symlinks `tasks/`). The unit cases above carry the CI signal.
  const tasksIndex = path.join(resolveTasksDir(REPO_ROOT), "index.json");
  const readIndex = async (): Promise<{ stories: IndexStory[] } | null> => {
    try {
      return JSON.parse(await readFile(tasksIndex, "utf8")) as { stories: IndexStory[] };
    } catch {
      return null;
    }
  };

  it("no comment in the tree names a story that has already landed", async (ctx) => {
    const index = await readIndex();
    if (!index) {
      ctx.skip(`no tasks index at ${tasksIndex}`);
      return;
    }
    const stale = staleStoryReferences(await scanStoryReferences(REPO_ROOT), index.stories);
    expect(stale.map((ref) => `${ref.file}:${ref.line} ${ref.slug}`)).toEqual([]);
  });
});
