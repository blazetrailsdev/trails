import { describe, it, expect } from "vitest";
import { generateFromSource } from "./index.js";
import { summarizeCoverage, mergeCoverages } from "./coverage.js";
import { Registry } from "./registry.js";
import { tsToRubyFile } from "./naming.js";
import { extractAsyncNames } from "./async-source.js";
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

  it("emits Ruby case-equality order (matcher === subject), not the reverse", async () => {
    // Ruby `case scope; when Symbol` is `Symbol === scope`; a plain `scope ===
    // Symbol` never matches a class/range/regex matcher. Must be caseEq(M, s).
    const { code } = await generateFromSource(`
      case scope
      when Symbol then a
      when Array, Hash then b
      end
    `);
    expect(code).toContain("caseEq(Symbol, scope)");
    expect(code).toContain("caseEq(Array, scope) || caseEq(Hash, scope)");
    expect(code).not.toContain("scope === Symbol");
  });

  it("marks methods async from the trails source of truth and awaits async calls", async () => {
    // `save`/`persist` are async per the port; `name` is not. Await only the
    // async-named calls, and only inside the async body.
    const asyncSet = new Set(["save", "persist"]);
    const { code } = await generateFromSource(
      `
      module M
        def save; self.persist(1); log; end
        def name; @name; end
      end
    `,
      asyncSet,
    );
    expect(code).toContain("export async function save(");
    expect(code).toContain("await this.persist(1)"); // async call awaited
    expect(code).toContain("export function name("); // not async
    expect(code).not.toContain("await this.log"); // log not in async set
  });

  it("never awaits async-named calls inside a sync method", async () => {
    const { code } = await generateFromSource(
      `module M
        def sync_reader; save; end
      end`,
      new Set(["save"]),
    );
    expect(code).toContain("export function syncReader(");
    expect(code).not.toContain("await save");
  });

  it("resolves async through Rails-name method maps, wrappers, and alias chains", () => {
    // Mirrors the trails FinderMethods/Calculations shape: async impls exposed
    // under Rails-facing keys, some wrapped, some via a const alias chain.
    const names = extractAsyncNames(`
      export async function performFind(this: R): Promise<any> {}
      export async function performCount(this: R): Promise<any> {}
      export const performSecondBang = bangFinder(performSecond);
      export async function performSecond(this: R): Promise<any> {}
      function inQueryConnection(fn) { return fn; }
      export const FinderMethods = {
        find: performFind,
        secondBang: performSecondBang,
      };
      export const Calculations = {
        count: inQueryConnection(performCount),
      };
      export function pluck() {} // sync — must NOT be marked async
    `);
    expect(names.has("find")).toBe(true); // bare ref
    expect(names.has("count")).toBe(true); // wrapped ref
    expect(names.has("secondBang")).toBe(true); // alias chain
    expect(names.has("pluck")).toBe(false);
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
