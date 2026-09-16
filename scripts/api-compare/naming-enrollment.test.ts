import { describe, it, expect } from "vitest";
import type { CallArgArtifact } from "./call-args-baseline.js";
import { NAMING_ENROLLED_PACKAGES, namingFindings } from "./lint-call-args.js";

type Row = CallArgArtifact["mismatches"][number];

const row = (over: Partial<Row>): Row => ({
  package: "i18n",
  tsFile: "backend/base.ts",
  rubyFile: "backend/base.rb",
  rubyName: "translate",
  tsName: "translate",
  call: "lookup",
  kind: "args",
  class: "naming",
  rubyArgs: [],
  tsArgs: [],
  ...over,
});

const artifact = (mismatches: Row[], extra: Partial<CallArgArtifact> = {}): CallArgArtifact => ({
  compared: mismatches.length,
  mismatches,
  ...extra,
});

const none = new Map<string, ReadonlySet<string>>();

describe("namingFindings", () => {
  it("reds an un-receipted naming row in an enrolled package", () => {
    const a = artifact([row({ rubyArgs: ["ref:options"], tsArgs: ["ref:opts"] })]);
    expect(namingFindings(a, none, ["i18n"]).map((f) => f.problem)).toEqual(["unreceipted"]);
  });

  it("does not gate an unenrolled package", () => {
    const a = artifact(
      [row({ package: "rack", rubyArgs: ["ref:options"], tsArgs: ["ref:opts"] })],
      {
        staleNameTags: [{ package: "rack", tsFile: "x.ts", tsName: "x", call: "default" }],
      },
    );
    expect(namingFindings(a, none, ["i18n"])).toEqual([]);
  });

  it("accepts a receipt on a permanent pair", () => {
    const a = artifact([
      row({ rubyArgs: ["ref:default"], tsArgs: ["ref:defaultValue"], receipts: ["default"] }),
    ]);
    expect(namingFindings(a, none, ["i18n"])).toEqual([]);
  });

  it("rejects a receipt on a convergeable pair", () => {
    const a = artifact([
      row({ rubyArgs: ["ref:options"], tsArgs: ["ref:opts"], receipts: ["options"] }),
    ]);
    expect(namingFindings(a, none, ["i18n"]).map((f) => f.problem)).toEqual([
      "receipt-on-convergeable",
    ]);
  });

  it("never rejects a module-mixin-call receipt when thisTypedFunctions is present", () => {
    const a = artifact([
      row({ rubyArgs: ["ref:columns_hash"], tsArgs: ["ref:call"], receipts: ["columns_hash"] }),
    ]);
    const thisTyped = new Map([["i18n", new Set(["columnsHash"])]]);
    expect(namingFindings(a, thisTyped, ["i18n"])).toEqual([]);
  });

  it("does not let a receipt for one identifier suppress a second on the same call", () => {
    const a = artifact([
      row({
        rubyArgs: ["ref:default", "ref:options"],
        tsArgs: ["ref:defaultValue", "ref:opts"],
        receipts: ["default"],
      }),
    ]);
    expect(namingFindings(a, none, ["i18n"])).toEqual([
      expect.objectContaining({ identifier: "options", problem: "unreceipted" }),
    ]);
  });

  it("reds a stale receipt in an enrolled package", () => {
    const a = artifact([], {
      staleNameTags: [{ package: "i18n", tsFile: "x.ts", tsName: "x", call: "default" }],
    });
    expect(namingFindings(a, none, ["i18n"]).map((f) => f.problem)).toEqual(["stale-receipt"]);
  });

  it("ignores shape rows", () => {
    const a = artifact([row({ class: "shape", rubyArgs: ["ref:options"], tsArgs: ["ref:opts"] })]);
    expect(namingFindings(a, none, ["i18n"])).toEqual([]);
  });
});

describe("NAMING_ENROLLED_PACKAGES", () => {
  it("only grows: every package ever enrolled stays enrolled", () => {
    expect(NAMING_ENROLLED_PACKAGES).toEqual(
      expect.arrayContaining(["activerecord-test-support", "globalid", "i18n"]),
    );
  });
});
