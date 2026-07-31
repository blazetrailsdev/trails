import { describe, it, expect } from "vitest";
import ts from "typescript";
import { generateFromSource } from "./index.js";
import { summarizeCoverage, mergeCoverages } from "./coverage.js";
import { Registry } from "./registry.js";
import { tsToRubyFile } from "./naming.js";
import { extractAsyncNames, resolveAsyncNames, rubyDefinedMethods } from "./async-source.js";
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
    expect(code).toContain("saveBang(force = false)");
    expect(code).toContain("isName(");
    expect(code).toContain("this.saved = true");
    expect(code).toContain("if (!this.isValid)");
  });
  it("records handled vs. passthrough coverage per node kind", async () => {
    const { coverage } = await generateFromSource(`def f(a); a + 1; end`);
    const s = summarizeCoverage(coverage);
    expect(s.total).toBeGreaterThan(0);
    expect(s.handledPct).toBeGreaterThan(0);
  });
  it("degrades unknown node kinds to a marked passthrough, never throws", async () => {
    const { code, coverage } = await generateFromSource(`BEGIN { x }`);
    const s = summarizeCoverage(coverage);
    expect(code).toContain("__PRISM_TODO(");
    expect(s.passthrough).toBeGreaterThan(0);
  });
  it("registry supports adding a node handler without central dispatch edits", () => {
    const r = new Registry();
    expect(r.has("FooNode")).toBe(false);
    const lit = ts.factory.createStringLiteral("ok");
    r.on("FooNode", () => lit);
    expect(r.get("FooNode")?.({} as never, {} as never)).toBe(lit);
  });
  it("renders string/symbol literals from Prism's unescaped object shape", async () => {
    const { code } = await generateFromSource(`x = "hello"; y = :sym`);
    expect(code).toContain('"hello"');
    expect(code).toContain('"sym"');
    expect(code).not.toContain("[object Object]");
  });
  it("inverts rubyFileToTs to resolve a trails .ts path to its Rails .rb", () => {
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
    expect(code).toContain("await this.persist(1)");
    expect(code).toContain("export function name(");
    expect(code).not.toContain("await this.log");
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
  it("emits parse-clean output by construction, even around passthroughs", async () => {
    const { code, coverage, parseErrorCount } = await generateFromSource(`
      def compare(a, b)
        a <=> b
      end
    `);
    expect(parseErrorCount).toBe(0);
    expect(code).not.toContain("<=>");
    expect(code).toContain("__PRISM_TODO(");
    expect(summarizeCoverage(coverage).passthrough).toBeGreaterThan(0);
  });
  it("declines silently-lossy translations instead of emitting wrong JS", async () => {
    const splat = await generateFromSource(`def g; a, *b = list; end`);
    expect(splat.parseErrorCount).toBe(0);
    expect(splat.code).toContain("__PRISM_TODO(");

    const multiIndex = await generateFromSource(`def h(m); m[1, 2] = 3; m[1, 2]; end`);
    expect(multiIndex.parseErrorCount).toBe(0);
    expect(multiIndex.code).not.toContain("m[1] = 3");
    expect(multiIndex.code).toContain("__PRISM_TODO(");
  });

  it("translates the decided block protocol: yield, block_given?, &:sym, <<", async () => {
    const { code, parseErrorCount } = await generateFromSource(`
      def each_name(list)
        return enum_for(:each_name) unless block_given?
        list.map(&:name).each { |n| yield(n) }
        names << 1
      end
    `);
    expect(parseErrorCount).toBe(0);
    expect(code).toContain("eachName(list, block)");
    expect(code).toContain("block !== undefined");
    expect(code).toContain("block(n)");
    expect(code).toContain("x => x.name()");
    expect(code).toContain("names.push(1)");
  });

  it("resolves receiverless calls to self: this.method, locals stay bare", async () => {
    const { code, parseErrorCount } = await generateFromSource(`
      def ordered(list)
        oc = build_columns(list)
        oc.concat(default_columns) if order_values.empty?
        oc
      end
    `);
    expect(parseErrorCount).toBe(0);
    expect(code).toContain("this.buildColumns(list)"); // receiverless w/ args → self-call
    expect(code).toContain("oc.concat(this.defaultColumns)"); // local stays bare; parenless → getter
    expect(code).toContain("this.orderValues.isEmpty()"); // parenless chain roots on this
    expect(code).toContain("return oc;"); // local read, never this-ified
  });

  it("translates attr-writer calls and expression-position raise", async () => {
    const { code, parseErrorCount } = await generateFromSource(`
      def rename(other)
        other.name = compute_name
        found || raise(ActiveRecord::RecordNotFound)
      end
    `);
    expect(parseErrorCount).toBe(0);
    expect(code).toContain("other.name = this.computeName");
    expect(code).toContain("throw ActiveRecord.RecordNotFound");
  });

  it("routes yield/block_given? through an explicitly named block param", async () => {
    const { code, parseErrorCount } = await generateFromSource(`
      def with_handler(&callback)
        yield(1) if block_given?
      end
    `);
    expect(parseErrorCount).toBe(0);
    expect(code).toContain("withHandler(callback)");
    expect(code).not.toContain("callback, block");
    expect(code).toContain("callback !== undefined");
    expect(code).toContain("callback(1)");
  });

  it("flattens statement-position module super per the composition-point convention", async () => {
    const { code, parseErrorCount } = await generateFromSource(`
      module M
        def init_internals
          super
          @association_cache = {}
        end
        def value_super
          x = super
          x
        end
      end
    `);
    expect(parseErrorCount).toBe(0);
    expect(code).not.toContain("super");
    expect(code).toContain("this.association_cache = {}");
    expect(code).toContain("__PRISM_TODO("); // value-position super still declines
  });

  it("imports only the runtime helpers the file actually uses", async () => {
    const withCase = await generateFromSource(`
      def kind(scope)
        case scope
        when Symbol then a
        end
      end
    `);
    expect(withCase.code).toContain('import { caseEq } from "./runtime.js";');

    const plain = await generateFromSource(`def f(a); a + 1; end`);
    expect(plain.code).not.toContain("runtime.js");
  });

  it("counts each node exactly once when a call declines after partial validation", async () => {
    const { coverage } = await generateFromSource(`def d(list); probe(9, &:+); end`);
    const int = coverage.counts.get("IntegerNode") ?? { handled: 0, passthrough: 0 };
    expect(int.handled).toBe(0);
    expect(int.passthrough).toBe(1);
  });

  it("distinguishes next/break in native loops from next in block callbacks", async () => {
    const loop = await generateFromSource(`
      def scan(xs)
        i = 0
        while i < 10
          i += 1
          next if i.zero?
          break if i > 5
        end
        i
      end
    `);
    expect(loop.parseErrorCount).toBe(0);
    expect(loop.code).toContain("continue;");
    expect(loop.code).toContain("break;");

    const lossyNext = await generateFromSource(`
      def scan2(xs)
        while more?
          next compute if skip?
          advance
        end
      end
    `);
    expect(lossyNext.parseErrorCount).toBe(0);
    expect(lossyNext.code).toContain("__PRISM_TODO(");

    const lossyBreak = await generateFromSource(`
      def scan3(xs)
        while more?
          break compute if done?
          advance
        end
      end
    `);
    expect(lossyBreak.parseErrorCount).toBe(0);
    expect(lossyBreak.code).not.toContain("break;");
    expect(lossyBreak.code).toContain("__PRISM_TODO(");

    const blockNext = await generateFromSource(`
      def pluck_all(xs)
        xs.map { |x| next 0 if x.nil?; x }
      end
    `);
    expect(blockNext.parseErrorCount).toBe(0);
    expect(blockNext.code).toContain("return 0;");
    expect(blockNext.code).not.toContain("continue");
  });

  it("declines reserved-word bindings but keeps them as property names", async () => {
    const { code, parseErrorCount } = await generateFromSource(
      `def use(record); record.delete; end
       def delete; 1; end`,
    );
    expect(parseErrorCount).toBe(0);
    expect(code).toContain("record.delete");
    expect(code).not.toContain("function delete");
  });

  it("converts Ruby's implicit return on the last statement of a def", async () => {
    const { code } = await generateFromSource(`
      def pick(a)
        if a
          a
        else
          fallback
        end
      end
    `);
    expect(code).toContain("return a;");
    expect(code).toContain("return this.fallback;");
  });
  it("attributes passthrough to the enclosing def for a trustworthy denominator", async () => {
    const { perDef } = await generateFromSource(`
      def clean(a); a + 1; end
      def dirty(oc); oc <=> 1; end
    `);
    expect(perDef.get("clean")?.passthrough).toBe(0);
    expect(perDef.get("dirty")?.passthrough).toBeGreaterThan(0);
  });
  it("resolves async through Rails-name method maps, wrappers, and alias chains", () => {
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
    expect(names.has("find")).toBe(true);
    expect(names.has("count")).toBe(true);
    expect(names.has("secondBang")).toBe(true);
    expect(names.has("pluck")).toBe(false);
  });
  it("scopes the relation.ts supplement to the file's own Rails defs", () => {
    const twinTs = `export const Calculations = { count: inQueryConnection(performCount) };
      export async function performCount() {}`;
    const relationTs = `class Relation {
      async pluck() {}
      async ids() {}
      async first() {}
      async isOne() {}
    }`;
    const ownRubyDefs = rubyDefinedMethods(`
      def count; end
      def pluck; end
      def ids; end
    `);
    const names = resolveAsyncNames({ twinTs, relationTs, ownRubyDefs });
    expect(names.has("count")).toBe(true);
    expect(names.has("pluck")).toBe(true);
    expect(names.has("ids")).toBe(true);
    expect(names.has("first")).toBe(false);
    expect(names.has("isOne")).toBe(false);
  });
  it("omits the relation supplement when no defs are provided (Model-side files)", () => {
    const names = resolveAsyncNames({ twinTs: `export async function save() {}` });
    expect(names.has("save")).toBe(true);
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
