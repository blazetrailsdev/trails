import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { serializeBaseline } from "./baseline-json.js";

const root = vi.hoisted(() => ({ dir: "" }));
vi.mock("./config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./config.js")>()),
  get ROOT_DIR() {
    return root.dir;
  },
  get SCRIPT_DIR() {
    return `${root.dir}/scripts/api-compare`;
  },
  get OUTPUT_DIR() {
    return `${root.dir}/scripts/api-compare/output`;
  },
}));

const { PACKAGES } = await import("./config.js");

const RUBY_FILE = "activerecord/lib/active_record/relation/query_methods.rb";
const TS_FILE = "relation/query-methods.ts";
const LEDGERED = "where";
const UNLEDGERED = "order";

async function writeJson(rel: string, value: unknown): Promise<void> {
  const file = path.join(root.dir, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, serializeBaseline(value));
}

const output = (file: string, value: unknown) =>
  writeJson(`scripts/api-compare/output/${file}`, value);

beforeEach(async () => {
  root.dir = await fs.mkdtemp(path.join(os.tmpdir(), "bump-ledger-gates-"));
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  await writeJson("scripts/parity/bump-ledger/rails.json", [
    {
      package: "activerecord",
      rubyFile: RUBY_FILE,
      rubyName: LEDGERED,
      kind: "drift",
      from: "v8.0.2",
      to: "v8.0.5",
    },
    {
      package: "activesupport",
      rubyFile: "activesupport/lib/active_support/inflector/inflections.rb",
      rubyName: "to_regex",
      kind: "drift",
      from: "v8.0.2",
      to: "v8.0.5",
    },
  ]);
  await output("body-hashes.json", {
    packages: PACKAGES,
    hashes: [
      ...[LEDGERED, UNLEDGERED].map((rubyName) => ({
        package: "activerecord",
        rubyFile: RUBY_FILE,
        rubyName,
        tsFile: TS_FILE,
        tsName: rubyName,
        digest: "x",
      })),
      ...["to_regex", "to_s"].map((rubyName) => ({
        package: "activesupport",
        rubyFile: "activesupport/lib/active_support/inflector/inflections.rb",
        rubyName,
        tsFile: "inflector/inflections.ts",
        tsName: rubyName === "to_s" ? "toS" : "toRegex",
        digest: "x",
      })),
    ],
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root.dir, { recursive: true, force: true });
});

const callRow = (rubyName: string, reason: string) => ({
  package: "activerecord",
  tsFile: TS_FILE,
  rubyName,
  call: "spawn",
  reason,
});

const mismatchArtifact = (rubyNames: string[]) => ({
  packages: PACKAGES,
  mismatches: rubyNames.map((rubyName) => ({
    package: "activerecord",
    tsFile: TS_FILE,
    rubyName,
    missing: ["spawn → spawn|_spawn"],
  })),
});

describe("lint-call-mismatches main", () => {
  it("--write keeps a ledgered baseline row, seeds no ledgered artifact row, and marks count it", async () => {
    const lint = await import("./lint-call-mismatches.js");
    const { loadMarks } = await import("./unreviewed-ratchet.js");
    const kept = { ...callRow(LEDGERED, lint.DEFAULT_REASON), call: "merge" };
    await lint.writeSplitBaseline([kept], lint.BASELINE_DIR);
    await output("call-mismatches.json", mismatchArtifact([LEDGERED, UNLEDGERED]));

    expect(await lint.main(true, false, false)).toBe(0);

    expect(await lint.loadBaseline()).toEqual([callRow(UNLEDGERED, lint.DEFAULT_REASON), kept]);
    const marks = await loadMarks(lint.MARK_DIR);
    expect(marks.get(lint.relPathFor(kept))).toBe(1);
  });

  for (const [rubyName, code] of [
    [LEDGERED, 0],
    [UNLEDGERED, 1],
  ] as const) {
    it(`gates a NEW row on ${rubyName} with exit ${code}`, async () => {
      const lint = await import("./lint-call-mismatches.js");
      await output("call-mismatches.json", mismatchArtifact([rubyName]));
      expect(await lint.main(false, false, false)).toBe(code);
    });

    it(`gates a STALE row on ${rubyName} with exit ${code}`, async () => {
      const lint = await import("./lint-call-mismatches.js");
      await lint.writeSplitBaseline([callRow(rubyName, "reviewed")], lint.BASELINE_DIR);
      await output("call-mismatches.json", mismatchArtifact([]));
      expect(await lint.main(false, false, false)).toBe(code);
    });

    it(`gates a STALE tag on ${rubyName} with exit ${code}`, async () => {
      const lint = await import("./lint-call-mismatches.js");
      await output("call-mismatches.json", {
        ...mismatchArtifact([]),
        staleTags: [{ package: "activerecord", tsFile: TS_FILE, tsName: rubyName, call: "spawn" }],
      });
      expect(await lint.main(false, false, false)).toBe(code);
    });
  }
});

const argRow = (rubyName: string) => ({
  package: "activerecord",
  tsFile: TS_FILE,
  rubyName,
  call: "spawn",
  kind: "args" as const,
  rubyArgs: ["a"],
});

const argArtifact = (rubyNames: string[]) => ({
  packages: PACKAGES,
  compared: rubyNames.length,
  mismatches: rubyNames.map((rubyName) => ({
    ...argRow(rubyName),
    rubyFile: RUBY_FILE,
    tsName: rubyName,
    class: "shape",
    tsArgs: [],
  })),
});

describe("lint-call-args main", () => {
  beforeEach(async () => {
    await output("ts-api.json", { packages: {} });
    await output("ar-closure.json", { files: {} });
  });

  it("--write keeps a ledgered baseline row and seeds no ledgered artifact row", async () => {
    const lint = await import("./lint-call-args.js");
    const { BASELINE_DIR, writeSplitBaseline } = await import("./lint-call-mismatches.js");
    const kept = { ...argRow(LEDGERED), call: "merge", reason: "reviewed" };
    await writeSplitBaseline([kept], BASELINE_DIR);
    await output("call-arg-mismatches.json", argArtifact([LEDGERED, UNLEDGERED]));

    expect(await lint.main(true)).toBe(0);

    expect(await lint.loadBaseline()).toEqual([
      { ...argRow(UNLEDGERED), reason: lint.DEFAULT_REASON },
      kept,
    ]);
  });

  for (const [rubyName, code] of [
    [LEDGERED, 0],
    [UNLEDGERED, 1],
  ] as const) {
    it(`gates a STALE tag on ${rubyName} with exit ${code}`, async () => {
      const lint = await import("./lint-call-args.js");
      const tag = { package: "activerecord", tsFile: TS_FILE, tsName: rubyName, call: "spawn" };
      await output("call-arg-mismatches.json", { ...argArtifact([]), staleTags: [tag] });
      expect(await lint.main(false)).toBe(code);
    });

    it(`gates a NEW row on ${rubyName} with exit ${code}`, async () => {
      const lint = await import("./lint-call-args.js");
      await output("call-arg-mismatches.json", argArtifact([rubyName]));
      expect(await lint.main(false)).toBe(code);
    });

    it(`gates a STALE row on ${rubyName} with exit ${code}`, async () => {
      const lint = await import("./lint-call-args.js");
      const { BASELINE_DIR, writeSplitBaseline } = await import("./lint-call-mismatches.js");
      await writeSplitBaseline([{ ...argRow(rubyName), reason: "reviewed" }], BASELINE_DIR);
      await output("call-arg-mismatches.json", argArtifact([]));
      expect(await lint.main(false)).toBe(code);
    });
  }
});

const compatArtifact = (rubyNames: string[]) => ({
  packages: PACKAGES,
  mismatches: rubyNames.map((rubyName) => ({
    package: "activesupport",
    tsFile: "inflector/inflections.ts",
    rubyName,
    missing: ["escape → escape|_escape"],
  })),
});

describe("lint-ruby-compat-calls main", () => {
  for (const [rubyName, code] of [
    ["to_regex", 0],
    ["to_s", 1],
  ] as const) {
    it(`gates a NEW row on ${rubyName} with exit ${code}`, async () => {
      const lint = await import("./lint-ruby-compat-calls.js");
      await output("call-mismatches.json", compatArtifact([rubyName]));
      expect(await lint.main()).toBe(code);
    });

    it(`gates a STALE row on ${rubyName} with exit ${code}`, async () => {
      const lint = await import("./lint-ruby-compat-calls.js");
      const { reverseRows } = await import("./report-ruby-compat.js");
      const { BASELINE_DIR, writeSplitBaseline } = await import("./lint-call-mismatches.js");
      const [{ tsExport: _tsExport, ...row }] = reverseRows(compatArtifact([rubyName]));
      await writeSplitBaseline([{ ...row, reason: "reviewed" }], BASELINE_DIR);
      await output("call-mismatches.json", compatArtifact([]));
      expect(await lint.main()).toBe(code);
    });
  }
});

describe("receipt-audit main", () => {
  for (const [tsName, code] of [
    [LEDGERED, undefined],
    [UNLEDGERED, 1],
  ] as const) {
    it(`gates a STALE tag on ${tsName} with exit ${code ?? 0}`, async () => {
      const { main } = await import("./receipt-audit.js");
      await output("rails-api.json", { packages: {} });
      await output("ts-api.json", { packages: {} });
      await output("call-mismatches.json", {
        staleTags: [{ package: "activerecord", tsFile: TS_FILE, tsName, call: "spawn" }],
      });
      await output("call-arg-mismatches.json", {});
      const before = process.exitCode;
      try {
        await main(["--gate"]);
        expect(process.exitCode ?? 0).toBe(code ?? 0);
      } finally {
        process.exitCode = before;
      }
    });
  }
});
