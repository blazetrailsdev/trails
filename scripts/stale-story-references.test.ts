import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectFrozenMarkdownFiles,
  collectMarkdownFiles,
  extractMarkdownStoryReferences,
  extractStoryReferences,
  loadStories,
  scanFrozenStoryReferences,
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

  it("flags a pending citation in markdown prose", () => {
    const refs = extractMarkdownStoryReferences(
      "Trails drops the subsecond part; the encoder is converged by\n`activesupport-json-encoding-time-precision`.\n",
      "docs/activesupport.md",
    );
    expect(staleStoryReferences(refs, STORIES)).toHaveLength(1);
  });

  it("ends a markdown block at a blank line", () => {
    const refs = extractMarkdownStoryReferences(
      "The encoder is converged by a later phase.\n\n`activesupport-json-encoding-time-precision` is the story id.\n",
      "docs/activesupport.md",
    );
    expect(refs).toEqual([]);
  });

  it("ignores a promise quoted inside a fenced code block", () => {
    const refs = extractMarkdownStoryReferences(
      "Example:\n\n```ts\n// Converged by `cache-entry-remaining-methods`.\n```\n",
      "docs/index.md",
    );
    expect(refs).toEqual([]);
  });

  it("scans no markdown outside the trails tree", async () => {
    const files = await collectMarkdownFiles(REPO_ROOT);
    expect(files).toContain(path.join("docs", "index.md"));
    expect(files.filter((file) => file.startsWith(`tasks${path.sep}`))).toEqual([]);
    expect(files.filter((file) => file.startsWith(path.join("docs", "activerecord")))).toEqual([]);
  });

  // The tasks repo is public and checked out into `tasks/` by the Unit Tests
  // job, so this gate compares the tree against real story statuses there as
  // well as in every agent worktree (start-worktree.sh symlinks the same path).
  // loadStories throws rather than skipping when that checkout is missing.
  //
  // The scans below are pure reads, so they run once here rather than per case,
  // and the hook carries its own timeout: under host load they overrun vitest's
  // 5s default, and a per-case timeout there reads like a stale citation.
  let treeStories: IndexStory[];
  let treeRefs: Awaited<ReturnType<typeof scanStoryReferences>>;
  let frozenFiles: string[];
  let frozenRefs: Awaited<ReturnType<typeof scanFrozenStoryReferences>>;

  beforeAll(async () => {
    treeStories = await loadStories(resolveTasksDir(REPO_ROOT));
    treeRefs = await scanStoryReferences(REPO_ROOT);
    frozenFiles = await collectFrozenMarkdownFiles(REPO_ROOT);
    frozenRefs = await scanFrozenStoryReferences(REPO_ROOT);
  }, 120_000);

  it("no comment or markdown paragraph in the tree names a story that has already landed", () => {
    const stale = staleStoryReferences(treeRefs, treeStories);
    expect(stale.map((ref) => `${ref.file}:${ref.line} ${ref.slug}`)).toEqual([]);
  });

  it("inventories stale citations in the frozen tree without gating on them", () => {
    expect(frozenFiles).toContain(path.join("docs", "activerecord", "parity-verification.md"));
    const stale = staleStoryReferences(frozenRefs, treeStories);
    if (stale.length > 0) {
      console.warn(
        `frozen-tree stale story citations (not gated):\n${stale
          .map((ref) => `  ${ref.file}:${ref.line} ${ref.slug}`)
          .join("\n")}`,
      );
    }
  });

  it("reads each story's status from its own frontmatter", () => {
    expect(
      treeStories.find((story) => story.id === "activesupport-json-encoding-time-precision"),
    ).toEqual({ id: "activesupport-json-encoding-time-precision", status: "done" });
  });

  it("refuses to pass without a tasks checkout", async () => {
    await expect(loadStories(path.join(REPO_ROOT, "no-such-tasks"))).rejects.toThrow(
      /cannot resolve story statuses/,
    );
  });
});
