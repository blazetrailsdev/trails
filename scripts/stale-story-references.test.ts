import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractStoryReferences,
  loadStories,
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
  { id: "activesupport-json-encoding-time-precision", status: "done" },
  { id: "converge-connection-pool-lifecycle-async", status: "ready" },
  { id: "cache-entry-remaining-methods", status: "closed" },
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

  it("flags every landed status a story can carry", () => {
    const refs = extractStoryReferences(
      "// Remaining wiring is pending convergence by `cache-entry-remaining-methods`.\n",
      "coder.ts",
    );
    expect(staleStoryReferences(refs, STORIES)).toHaveLength(1);
  });

  it("flags a promise whose slug sits in a later sentence than its phrase", () => {
    const refs = extractStoryReferences(
      "// Until the connection is threaded into `create` it falls back to the\n" +
        "// owner's pool. Tracked by `cache-entry-remaining-methods`.\n",
      "association-scope.ts",
    );
    expect(staleStoryReferences(refs, STORIES)).toHaveLength(1);
  });

  it("flags the tracked-by family and a TODO tag", () => {
    for (const comment of [
      "// Known gap, tracked to `cache-entry-remaining-methods`.\n",
      "// This is tracked separately in `cache-entry-remaining-methods`.\n",
      "// TODO(cache-entry-remaining-methods): drop the shim.\n",
    ]) {
      expect(staleStoryReferences(extractStoryReferences(comment, "x.ts"), STORIES)).toHaveLength(
        1,
      );
    }
  });

  it("ignores a landed-story citation in a block that promises a different story", () => {
    const refs = extractStoryReferences(
      "// TODO(converge-connection-pool-lifecycle-async): remove it.fails when\n" +
        "// that story fixes the gap. `cache-entry-remaining-methods` landed\n" +
        "// (#3874) without closing it.\n",
      "associations.test.ts",
    );
    expect(refs.map((ref) => ref.slug)).toEqual(["converge-connection-pool-lifecycle-async"]);
    expect(staleStoryReferences(refs, STORIES)).toEqual([]);
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

  // The tasks repo is public and checked out into `tasks/` by the Unit Tests
  // job, so this gate compares the tree against real story statuses there as
  // well as in every agent worktree (start-worktree.sh symlinks the same path).
  // loadStories throws rather than skipping when that checkout is missing.
  it("no comment in the tree names a story that has already landed", async () => {
    const stories = await loadStories(resolveTasksDir(REPO_ROOT));
    const stale = staleStoryReferences(await scanStoryReferences(REPO_ROOT), stories);
    expect(stale.map((ref) => `${ref.file}:${ref.line} ${ref.slug}`)).toEqual([]);
  });

  it("reads each story's status from its own frontmatter", async () => {
    const stories = await loadStories(resolveTasksDir(REPO_ROOT));
    expect(
      stories.find((story) => story.id === "activesupport-json-encoding-time-precision"),
    ).toEqual({ id: "activesupport-json-encoding-time-precision", status: "done" });
  });

  it("refuses to pass without a tasks checkout", async () => {
    await expect(loadStories(path.join(REPO_ROOT, "no-such-tasks"))).rejects.toThrow(
      /cannot resolve story statuses/,
    );
  });
});
