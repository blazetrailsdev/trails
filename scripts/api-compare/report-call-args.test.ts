import { describe, it, expect } from "vitest";
import { renderReport } from "./report-call-args.js";

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    package: "arel",
    rubyFile: "visitors/to_sql.rb",
    tsFile: "visitors/to-sql.ts",
    rubyName: "inject_join",
    tsName: "injectJoin",
    call: "visit",
    class: "shape",
    rubyArgs: ["ref:o", "ref:collector"],
    tsArgs: ["ref:collector", "ref:o"],
    ...over,
  } as Parameters<typeof renderReport>[0]["mismatches"][number];
}

describe("renderReport", () => {
  const artifact = {
    compared: 302,
    mismatched: 3,
    mismatches: [
      row(),
      row({ class: "naming", call: "quote" }),
      row({ package: "activerecord", tsFile: "relation.ts", class: "shape", call: "where" }),
    ],
  };

  it("groups by package", () => {
    expect(renderReport(artifact, 20)).toContain("By package (2)");
  });

  it("groups by file", () => {
    const out = renderReport(artifact, 20);
    expect(out).toContain("By file (2)");
    expect(out).toContain("arel/visitors/to-sql.ts");
  });

  it("groups by class", () => {
    const out = renderReport(artifact, 20);
    expect(out).toContain("By class (2)");
    expect(out).toMatch(/shape\s+2/);
    expect(out).toMatch(/naming\s+1/);
  });

  it("reports the compared population", () => {
    expect(renderReport(artifact, 20)).toContain("3 row(s) across 2 file(s), 302 call site(s)");
  });

  it("truncates a grouping to --top", () => {
    expect(renderReport(artifact, 1)).toContain("By file (top 1 of 2)");
  });
});
