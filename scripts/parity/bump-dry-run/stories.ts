/**
 * The burn-down story generator (RFC 0191 § 7, item 4): turns a bump's seeded
 * ledger, the two refs' Ruby test manifests and the comparers' file maps into
 * one tasks-repo story per package, split along subsystem directories where a
 * package is too large to review as one PR. Nothing here names a source or a
 * ref: `generate-stories.ts` supplies both.
 *
 * Hard rules: no node:* imports, no process.*, no I/O.
 */

import { testIndex, type PairSeedRow, type RubyTestManifest, type TestSeedRow } from "./ledger.js";

export interface Subsystem {
  name: string;
  /** A Ruby lib or test file belongs to the first subsystem one of whose prefixes it starts with. */
  prefixes: string[];
}

export interface StoryInput {
  source: string;
  from: string;
  to: string;
  rfc: string;
  pairRows: readonly PairSeedRow[];
  testRows: readonly TestSeedRow[];
  fromTests: RubyTestManifest;
  toTests: RubyTestManifest;
  /** `<package> <rubyFile>` → the TS file the API comparer pairs with it. */
  tsFileOf: ReadonlyMap<string, string>;
  /** `<package> <rubyTestFile>` → the TS test file the test comparer pairs with it. */
  tsTestFileOf: ReadonlyMap<string, string>;
  /** `<package> <rubyTestFile>` → the descriptions the test comparer reports missing at `to`. */
  missing: ReadonlyMap<string, ReadonlySet<string>>;
  /** The vendored lib / test directory of a package at a ref, relative to the trails root. */
  libDir: (pkg: string, ref: string) => string;
  testDir: (pkg: string, ref: string) => string;
  /** Packages in dependency order; a package's stories depend on every story of the one before. */
  order: readonly string[];
  subsystems: Readonly<Record<string, readonly Subsystem[]>>;
  /** `<package> <rubyFile>` → story ids the story owning that file also depends on. */
  fileDeps: Readonly<Record<string, readonly string[]>>;
  /** A package with more Ruby files than this is split by `subsystems`. */
  splitThreshold: number;
  /** A comparer package → the trails package its story lists, where the two differ. */
  trailsPackage: Readonly<Record<string, string>>;
}

interface TestFileWork {
  added: string[];
  removed: string[];
  changed: string[];
}

export interface Story {
  id: string;
  package: string;
  subsystem: string | null;
  deps: string[];
  libFiles: Map<string, PairSeedRow[]>;
  testFiles: Map<string, TestFileWork>;
}

export function refSlug(ref: string): string {
  return ref.replace(/^v/, "").replace(/[^A-Za-z0-9]+/g, "-");
}

function storyId(input: StoryInput, pkg: string, sub: string | null): string {
  return [input.source, refSlug(input.to), pkg, sub].filter((s) => s !== null).join("-");
}

function testWork(input: StoryInput): Map<string, Map<string, TestFileWork>> {
  const out = new Map<string, Map<string, TestFileWork>>();
  const at = (pkg: string, file: string): TestFileWork => {
    const files = out.get(pkg) ?? new Map<string, TestFileWork>();
    out.set(pkg, files);
    const w = files.get(file) ?? { added: [], removed: [], changed: [] };
    files.set(file, w);
    return w;
  };
  const pkgs = new Set([
    ...Object.keys(input.fromTests.packages),
    ...Object.keys(input.toTests.packages),
  ]);
  for (const pkg of pkgs) {
    const a = testIndex(input.fromTests, pkg);
    const c = testIndex(input.toTests, pkg);
    const moved = new Set(
      input.testRows
        .filter((r) => r.package === pkg && r.kind === "moved")
        .flatMap((r) => [`${r.rubyFile} ${r.path}`, `${r.rubyFile} ${r.toPath ?? r.path}`]),
    );
    const missing = (tc: { file: string; description: string }) =>
      input.missing.get(`${pkg} ${tc.file}`)?.has(tc.description) ?? true;
    for (const [key, tc] of c)
      if (!a.has(key) && !moved.has(key) && missing(tc)) at(pkg, tc.file).added.push(tc.path);
    for (const [key, tc] of a)
      if (!c.has(key) && !moved.has(key)) at(pkg, tc.file).removed.push(tc.path);
  }
  for (const r of input.testRows)
    at(r.package, r.rubyFile).changed.push(r.kind === "moved" ? `${r.path} → ${r.toPath}` : r.path);
  return out;
}

function subsystemOf(subs: readonly Subsystem[], file: string): string {
  return subs.find((s) => s.prefixes.some((p) => file.startsWith(p)))?.name ?? "other";
}

export function planStories(input: StoryInput): Story[] {
  const lib = new Map<string, Map<string, PairSeedRow[]>>();
  for (const r of input.pairRows) {
    const files = lib.get(r.package) ?? new Map<string, PairSeedRow[]>();
    lib.set(r.package, files);
    files.set(r.rubyFile, [...(files.get(r.rubyFile) ?? []), r]);
  }
  const tests = testWork(input);
  const pkgs = [...new Set([...lib.keys(), ...tests.keys()])];
  const rank = (p: string) => {
    const i = input.order.indexOf(p);
    return i < 0 ? input.order.length : i;
  };
  pkgs.sort((x, y) => rank(x) - rank(y) || (x < y ? -1 : 1));

  const stories: Story[] = [];
  let previous: string[] = [];
  for (const pkg of pkgs) {
    const libFiles = lib.get(pkg) ?? new Map<string, PairSeedRow[]>();
    const testFiles = tests.get(pkg) ?? new Map<string, TestFileWork>();
    const subs = input.subsystems[pkg] ?? [];
    const liveTests = [...testFiles.values()].filter(
      (w) => w.added.length + w.removed.length + w.changed.length > 0,
    ).length;
    const split = subs.length > 0 && libFiles.size + liveTests > input.splitThreshold;
    const bySub = new Map<string | null, Story>();
    const storyFor = (file: string): Story => {
      const sub = split ? subsystemOf(subs, file) : null;
      let s = bySub.get(sub);
      if (s === undefined) {
        s = {
          id: storyId(input, pkg, sub),
          package: pkg,
          subsystem: sub,
          deps: [...previous],
          libFiles: new Map(),
          testFiles: new Map(),
        };
        bySub.set(sub, s);
      }
      return s;
    };
    for (const [file, rows] of [...libFiles].sort()) {
      const s = storyFor(file);
      s.libFiles.set(file, rows);
      for (const d of input.fileDeps[`${pkg} ${file}`] ?? [])
        if (!s.deps.includes(d)) s.deps.push(d);
    }
    for (const [file, w] of [...testFiles].sort()) {
      if (w.added.length + w.removed.length + w.changed.length === 0) continue;
      storyFor(file).testFiles.set(file, w);
    }
    const made = [...bySub.values()].sort((x, y) => (x.id < y.id ? -1 : 1));
    stories.push(...made);
    if (made.length > 0) previous = made.map((s) => s.id);
  }
  return stories;
}

function list(title: string, items: readonly string[]): string[] {
  return items.length === 0 ? [] : [`${title}:`, "", ...items.map((i) => `- \`${i}\``), ""];
}

export function renderStory(input: StoryInput, s: Story, cluster: string): string {
  const where = s.subsystem === null ? s.package : `${s.package} (${s.subsystem})`;
  const rows = [...s.libFiles.values()].reduce((n, r) => n + r.length, 0);
  const testCount = [...s.testFiles.values()].reduce(
    (n, w) => n + w.added.length + w.removed.length + w.changed.length,
    0,
  );
  const out: string[] = [
    "---",
    `title: ${JSON.stringify(`Burn down ${where} from ${input.source} ${input.from} to ${input.to}`)}`,
    "status: draft",
    `rfc: ${JSON.stringify(input.rfc)}`,
    `cluster: ${cluster}`,
    `packages: [${JSON.stringify(input.trailsPackage[s.package] ?? s.package)}]`,
    s.deps.length === 0 ? "deps: []" : ["deps:", ...s.deps.map((d) => `  - ${d}`)].join("\n"),
    "deps-rfc: []",
    `est-loc: ${Math.max(50, rows * 15 + testCount * 25)}`,
    "priority: null",
    "pr: null",
    "claim: null",
    "assignee: null",
    "blocked-by: null",
    "closed-reason: null",
    "---",
    "",
    "## Context",
    "",
    `Generated by \`scripts/parity/bump-dry-run/generate-stories.ts\` from the ${input.source} bump ledger ` +
      `(${input.from} → ${input.to}): ${rows} ledger row(s) in ${s.libFiles.size} Ruby file(s), and ` +
      `${testCount} test(s) added, removed or changed upstream in ${s.testFiles.size} test file(s). ` +
      "The ledger is the authority; this list is its snapshot. Added tests the test comparer already matches are omitted. " +
      "The PR LOC ceiling is waived for this story (RFC 0191, `generate-the-rails-8-0-5-1-burn-down-stories`).",
    "",
  ];
  for (const [file, fileRows] of s.libFiles) {
    out.push(
      `### \`${file}\``,
      "",
      "```sh",
      `git diff --no-index ${input.libDir(s.package, input.from)}/${file} ${input.libDir(s.package, input.to)}/${file}`,
      "```",
      "",
      `TS: \`${input.tsFileOf.get(`${s.package} ${file}`) ?? "(no TS file)"}\``,
      "",
      ...fileRows.map((r) => `- ${r.kind} \`${r.rubyName}\``),
      "",
    );
  }
  for (const [file, w] of s.testFiles) {
    out.push(
      `### \`${file}\``,
      "",
      "```sh",
      `git diff --no-index ${input.testDir(s.package, input.from)}/${file} ${input.testDir(s.package, input.to)}/${file}`,
      "```",
      "",
      `TS: \`${input.tsTestFileOf.get(`${s.package} ${file}`) ?? "(no TS test file)"}\``,
      "",
      ...list("Added", w.added),
      ...list("Removed", w.removed),
      ...list("Changed", w.changed),
    );
  }
  out.push(
    "## Acceptance criteria",
    "",
    ...[...s.libFiles.keys()].map(
      (f) =>
        `- [ ] \`${f}\` re-verified against ${input.to}, then ` +
        `\`pnpm tsx scripts/api-compare/body-pins.ts --pin ${f} --package ${s.package}\`.`,
    ),
    `- [ ] \`scripts/parity/bump-ledger/${input.source}.json\` and \`${input.source}.tests.json\` ` +
      `hold no row for ${s.package} in this story's files.`,
    ...(s.testFiles.size > 0
      ? [
          "- [ ] Each upstream-added test is ported, or recorded as not ported with its reason; " +
            "each changed test's TS twin matches the new body; each removed test's twin is deleted.",
        ]
      : []),
    "",
  );
  return out.join("\n");
}
