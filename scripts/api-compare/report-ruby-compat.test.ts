import { describe, expect, it } from "vitest";
import { type Artifact, rowsOfKind } from "./call-mismatch-baseline.js";
import { type TsApi, forwardCredits, renderReport, reverseRows } from "./report-ruby-compat.js";

const row = (pkg: string, tsFile: string, rubyName: string, missing: string) => ({
  package: pkg,
  tsFile,
  rubyName,
  missing: [missing],
});

const artifact: Artifact = {
  packages: [],
  mismatches: [
    row("activesupport", "inflector/inflections.ts", "to_regex", "escape → escape|_escape"),
    row("actiondispatch", "middleware/ssl.ts", "redirect_to_https", "fetch → fetch|_fetch"),
    row("rack", "builder.ts", "load_file", "read → read|_read"),
  ],
};

const api: TsApi = {
  packages: {
    activesupport: {
      fileFunctions: { "inflector.ts": [{ name: "titleize", calls: ["regexpEscape"] }] },
    },
    "ruby-compat": {
      fileFunctions: { "regexp.ts": [{ name: "regexpEscape", calls: ["replace"] }] },
    },
  },
};

describe("reverseRows", () => {
  it("flags a Ruby core call whose ruby-compat port the body did not make", () => {
    expect(reverseRows(artifact)).toEqual([
      {
        package: "activesupport",
        tsFile: "inflector/inflections.ts",
        rubyName: "to_regex",
        call: "escape",
        kind: "rubyCompat",
        tsExport: "regexpEscape",
      },
    ]);
  });

  it("flags neither an ambiguous receiver nor a call the table does not name", () => {
    const calls = reverseRows(artifact).map((r) => r.call);
    expect(calls).not.toContain("fetch");
    expect(calls).not.toContain("read");
  });

  it("emits rows the two existing gates do not read", () => {
    const rows = reverseRows(artifact);
    expect(rowsOfKind(rows, "calls")).toEqual([]);
    expect(rowsOfKind(rows, "args")).toEqual([]);
    expect(rowsOfKind(rows, "rubyCompat")).toHaveLength(1);
  });
});

describe("forwardCredits", () => {
  it("credits a body that calls the export, never ruby-compat's own", () => {
    expect(forwardCredits(api)).toEqual([
      {
        package: "activesupport",
        tsFile: "inflector.ts",
        name: "titleize",
        tsExport: "regexpEscape",
      },
    ]);
  });

  it("counts both directions in the report header", () => {
    expect(renderReport(artifact, api, 20)).toContain(
      "1 unconverged row(s) across 1 file(s); 1 call site(s) already credited",
    );
  });
});
