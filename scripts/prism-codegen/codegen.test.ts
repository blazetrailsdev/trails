import { describe, it, expect } from "vitest";
import { generateFromSource } from "./index.js";
import { summarizeCoverage, mergeCoverages } from "./coverage.js";
import { Registry } from "./registry.js";
import { tsToRubyFile } from "./naming.js";
import type { Coverage } from "./types.js";

describe("prism-codegen", () => {
  it("translates class/def shape and method-name conventions", async () => {
    const { code } = await generateFromSource(`
      class Widget < Base
        def save!(force = false)
          return false unless valid?
          @saved = true
        end
        def name?; @name.present?; end
      end
    `);
    expect(code).toContain("export class Widget extends Base");
    expect(code).toContain("saveBang(force = false)"); // ! → Bang
    expect(code).toContain("isName("); // predicate → is*
    expect(code).toContain("this.saved = true"); // @ivar → this.
    // Bare receiver-less predicate renders as an identifier — the tool can't
    // deterministically tell a no-arg method call from a local read.
    expect(code).toContain("if (!(isValid))"); // unless → if (!(...))
  });

  it("records handled vs. passthrough coverage per node kind", async () => {
    const { coverage } = await generateFromSource(`def f(a); a + 1; end`);
    const s = summarizeCoverage(coverage);
    expect(s.total).toBeGreaterThan(0);
    expect(s.handledPct).toBeGreaterThan(0);
  });

  it("degrades unknown node kinds to a marked passthrough, never throws", async () => {
    // BEGIN {} is a rarely-handled kind; the emitter must not throw.
    const { code, coverage } = await generateFromSource(`BEGIN { x }`);
    const s = summarizeCoverage(coverage);
    expect(code).toContain("TODO(");
    expect(s.passthrough).toBeGreaterThan(0);
  });

  it("registry supports adding a node handler without central dispatch edits", () => {
    const r = new Registry();
    expect(r.has("FooNode")).toBe(false);
    r.on("FooNode", () => "ok");
    expect(r.get("FooNode")?.({} as never, {} as never)).toBe("ok");
  });

  it("renders string/symbol literals from Prism's unescaped object shape", async () => {
    const { code } = await generateFromSource(`x = "hello"; y = :sym`);
    expect(code).toContain('"hello"');
    expect(code).toContain('"sym"');
    expect(code).not.toContain("[object Object]");
  });

  it("inverts rubyFileToTs to resolve a trails .ts path to its Rails .rb", () => {
    // Reuses the EXISTING api-compare mapping (no new mapping) — nested + top-level.
    const candidates = ["active_record/persistence.rb", "active_record/relation/query_methods.rb"];
    expect(tsToRubyFile("packages/activerecord/src/relation/query-methods.ts", candidates)).toBe(
      "active_record/relation/query_methods.rb",
    );
    expect(tsToRubyFile("packages/activerecord/src/persistence.ts", candidates)).toBe(
      "active_record/persistence.rb",
    );
    expect(tsToRubyFile("packages/activerecord/src/nope.ts", candidates)).toBeUndefined();
  });

  it("rolls up per-file coverage tallies into one summary", () => {
    const mk = (handled: number, pass: number): Coverage => ({
      record() {},
      counts: new Map([["CallNode", { handled, passthrough: pass }]]),
    });
    const merged = mergeCoverages([mk(8, 2), mk(10, 0)]);
    expect(merged.total).toBe(20);
    expect(merged.handled).toBe(18);
    expect(merged.passthrough).toBe(2);
    expect(merged.handledPct).toBeCloseTo(90);
  });
});
