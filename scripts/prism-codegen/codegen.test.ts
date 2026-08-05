import { describe, it, expect } from "vitest";
import ts from "typescript";
import { generateFromSource, delegationsFromSource } from "./index.js";
import { summarizeCoverage, mergeCoverages } from "./coverage.js";
import { Registry } from "./registry.js";
import { tsToRubyFile } from "./naming.js";
import {
  buildAsyncManifest,
  crossFileAsyncNames,
  extractAsyncNames,
  inferAsyncFromBodies,
  resolveAsyncNames,
  scopedRubyDefs,
} from "./async-source.js";
import type { Coverage } from "./types.js";
describe("prism-codegen", () => {
  it("emits class-body macro statements after the class, with self bound to the class", async () => {
    const { code } = await generateFromSource(`
      class Widget < Base
        include Persistence
        extend Querying
        self.param_delimiter = "_"
        def save!; true; end
      end
    `);
    expect(code).toMatch(/export class Widget extends Base \{[\s\S]*saveBang\(\)[\s\S]*\}/);
    expect(code).toContain("Widget.include(Persistence)");
    expect(code).toContain("Widget.extend(Querying)");
    expect(code).toContain('Widget.paramDelimiter = "_"');
    expect(code.indexOf("Widget.include")).toBeGreaterThan(code.indexOf("class Widget"));
  });

  it("keeps self as this inside a method body", async () => {
    const { code } = await generateFromSource(`
      class Widget
        include Persistence
        def owner; self; end
      end
    `);
    expect(code).toContain("Widget.include(Persistence)");
    expect(code).toContain("return this;");
  });

  it("emits a singleton class body's macros against the class too", async () => {
    const { code } = await generateFromSource(`
      class Widget
        class << self
          attr_reader :name
        end
      end
    `);
    expect(code).toContain('Widget.attrReader("name")');
  });

  it("leaves a class-body alias and the bare visibility keywords unemitted", async () => {
    const { code } = await generateFromSource(`
      class Widget
        include Persistence
        alias :klass :model
        private
        protected
        def save!; true; end
      end
    `);
    expect(code).toContain("Widget.include(Persistence)");
    expect(code).not.toContain("const klass");
    expect(code).not.toContain("Widget.private");
    expect(code).not.toContain("Widget.protected");
  });

  it("leaves a class-body constant built with Array#+ unemitted", async () => {
    const { code } = await generateFromSource(`
      class Widget
        MULTI = [:a]
        SINGLE = [:b]
        VALUE_METHODS = MULTI + SINGLE
      end
    `);
    expect(code).toContain("const MULTI =");
    expect(code).not.toContain("VALUE_METHODS");
  });

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
  it("awaits self-calls but leaves a same-named call on an unrelated receiver bare", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(ids)
          first
          self.first
          ids.first
          @scope.first
          ids.first.first
        end
      end`,
      new Set(["first", "loadAll"]),
    );
    expect(code).toContain("await this.first()");
    expect(code).toContain("ids.first()");
    expect(code).not.toContain("await ids.first()");
    expect(code).not.toContain("await this.scope.first()");
    expect(code).not.toContain("await ids.first().first()");
  });
  it("awaits through a receiver assigned from an async self-call", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all
          @relation = build_relation()
          @relation.load
          rel = self.build_relation
          rel.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).toContain("this.relation = await this.buildRelation()");
    expect(code).toContain("await this.relation.load()");
    expect(code).toContain("await rel.load()");
  });
  it("leaves a receiver of unknown provenance bare", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(arg)
          @relation.load
          arg.load
          @other = arg
          @other.load
        end
      end`,
      new Set(["load", "loadAll"]),
    );
    expect(code).not.toContain("await this.relation.load()");
    expect(code).not.toContain("await arg.load()");
    expect(code).not.toContain("await this.other.load()");
  });
  it("claims no provenance from a paren-less self-call, which emits a method reference", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all
          @relation = build_relation
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).toContain("this.relation = this.buildRelation;");
    expect(code).not.toContain("await this.relation.load()");
  });
  it("stops awaiting a receiver reassigned from an unknown value", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(arg)
          @relation = build_relation()
          @relation.load
          @relation = arg
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).toContain("await this.relation.load()");
    expect(code.match(/await this\.relation\.load\(\)/g)).toHaveLength(1);
  });
  it("stops awaiting a receiver rebound by a logical or destructuring write", async () => {
    const orWrite = await generateFromSource(
      `module M
        def load_all(arg)
          @relation = build_relation()
          @relation ||= arg
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(orWrite.code).not.toContain("await this.relation.load()");
    const multiWrite = await generateFromSource(
      `module M
        def load_all(arg)
          rel = build_relation()
          rel, other = arg
          rel.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(multiWrite.code).not.toContain("await rel.load()");
  });
  it("does not award an await from provenance established in only one branch", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(flag, arg)
          @relation = arg
          if flag
            @relation = build_relation()
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).toContain("this.relation.load()");
    expect(code).not.toContain("await this.relation.load()");
  });
  it("awaits after a branch whose every arm establishes provenance", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(flag)
          if flag
            @relation = build_relation()
          else
            @relation = self.build_relation()
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).toContain("await this.relation.load()");
  });
  it("applies a retraction inside a single branch arm eagerly", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(flag, arg)
          @relation = build_relation()
          if flag
            @relation = arg
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).not.toContain("await this.relation.load()");
  });
  it("does not leak provenance established inside a loop body", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(flag)
          while flag
            @relation = build_relation()
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).not.toContain("await this.relation.load()");
  });
  it("awaits after a case whose every arm, including else, establishes provenance", async () => {
    const both = await generateFromSource(
      `module M
        def load_all(kind)
          case kind
          when :a then @relation = build_relation()
          else @relation = self.build_relation()
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(both.code).toContain("await this.relation.load()");
    const noElse = await generateFromSource(
      `module M
        def load_all(kind, arg)
          @relation = arg
          case kind
          when :a then @relation = build_relation()
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(noElse.code).not.toContain("await this.relation.load()");
  });
  it("does not leak provenance from a begin body its rescue arm never establishes", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(arg)
          begin
            @relation = build_relation()
          rescue => e
            @relation = arg
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).not.toContain("await this.relation.load()");
  });
  it("awaits after a begin/rescue whose body and rescue arm both establish provenance", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all
          begin
            @relation = build_relation()
          rescue => e
            @relation = self.build_relation()
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).toContain("await this.relation.load()");
  });
  it("carries provenance past a begin/ensure with no rescue, which cannot branch", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all
          begin
            @relation = build_relation()
          ensure
            log
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).toContain("await this.relation.load()");
  });
  it("awaits after a branch whose other arm returns instead of falling through", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(flag)
          if flag
            return nil
          else
            @relation = build_relation()
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).toContain("await this.relation.load()");
  });
  it("awaits after a case whose only non-returning arm establishes provenance", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(flag)
          case flag
          when :skip
            return nil
          else
            @relation = build_relation()
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).toContain("await this.relation.load()");
  });
  it("ignores a retraction inside an arm that raises instead of falling through", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(flag, arg)
          @relation = build_relation()
          if flag
            @relation = arg
            raise ArgumentError, "no"
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).toContain("await this.relation.load()");
  });
  it("treats a raise the emitter does not turn into a throw as falling through", async () => {
    for (const tail of ["raise", "raise error_class, 1, 2"]) {
      const { code } = await generateFromSource(
        `module M
          def load_all(flag, arg)
            @relation = build_relation()
            if flag
              @relation = arg
              ${tail}
            end
            @relation.load
          end
        end`,
        new Set(["load", "loadAll", "buildRelation"]),
      );
      expect(code).not.toContain("throw");
      expect(code).not.toContain("await this.relation.load()");
    }
  });
  it("treats a next carrying a value as falling through, since no continue is emitted", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(flag, arg)
          @relation = build_relation()
          while flag
            if flag
              @relation = arg
              next 5
            end
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).not.toContain("continue");
    expect(code).not.toContain("await this.relation.load()");
  });
  it("treats a break outside a loop as falling through, since no break is emitted", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(flag, arg)
          @relation = build_relation()
          if flag
            @relation = arg
            break
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).not.toContain("await this.relation.load()");
  });
  it("keeps provenance across a guard clause that returns", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(flag, arg)
          @relation = build_relation()
          return nil if flag
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).toContain("await this.relation.load()");
  });
  it("awards no await from provenance established only in an arm that returns", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(flag)
          if flag
            @relation = build_relation()
            return nil
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).not.toContain("await this.relation.load()");
  });
  it("leaves bindings untouched when every arm of a branch returns", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(flag, arg)
          @relation = build_relation()
          if flag
            @relation = arg
            return nil
          else
            return arg
          end
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).toContain("await this.relation.load()");
  });
  it("stops awaiting a receiver rebound by an operator write", async () => {
    const ivarWrite = await generateFromSource(
      `module M
        def load_all(arg)
          @relation = build_relation()
          @relation += arg
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(ivarWrite.code).not.toContain("await this.relation.load()");
    const localWrite = await generateFromSource(
      `module M
        def load_all(arg)
          rel = build_relation()
          rel += arg
          rel.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(localWrite.code).not.toContain("await rel.load()");
  });
  it("stops awaiting a receiver rebound by a nested destructuring target", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all(arg)
          rel = build_relation()
          first, (rel, _rest) = arg
          rel.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
    );
    expect(code).not.toContain("await rel.load()");
  });
  it("does not carry async provenance across defs", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all
          @relation = build_relation()
          @relation.load
        end
        def reload_all
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "reloadAll", "buildRelation"]),
    );
    expect(code.match(/await this\.relation\.load\(\)/g)).toHaveLength(1);
  });
  it("marks a block arrow async when its own body awaits, not when only a nested one does", async () => {
    const { code } = await generateFromSource(
      `module M
        def create(attrs)
          attrs.collect { |attr| save(attr) }
          a = attrs.each { |attr| attr.collect { |x| save(x) } }
          b = attrs.each { |attr| attr.size }
        end
      end`,
      new Set(["save", "create"]),
    );
    expect(code).toContain("attrs.map(async (attr) => await this.save(attr))");
    expect(code).toContain("attrs.forEach(attr => attr.map(async (x) => await this.save(x)))");
    expect(code).toContain("attrs.forEach(attr => attr.size())");
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
        a =~ b
      end
    `);
    expect(parseErrorCount).toBe(0);
    expect(code).not.toContain("=~");
    expect(code).toContain("__PRISM_TODO(");
    expect(summarizeCoverage(coverage).passthrough).toBeGreaterThan(0);
  });
  it("declines silently-lossy translations instead of emitting wrong JS", async () => {
    const splat = await generateFromSource(`def g; a, *b, c = list; end`);
    expect(splat.parseErrorCount).toBe(0);
    expect(splat.code).toContain("__PRISM_TODO(");
  });

  it("images a trailing-splat multi-assign as a JS rest element", async () => {
    const { code, parseErrorCount } = await generateFromSource(`def g; a, *b = list; a; end`);
    expect(parseErrorCount).toBe(0);
    expect(code).toContain("[a, ...b] = ");
    expect(code).not.toContain("__PRISM_TODO(");
  });

  it("images a lambda as an arrow function", async () => {
    const { code, parseErrorCount } = await generateFromSource(
      `def g; adder = ->(x, y) { x + y }; adder; end`,
    );
    expect(parseErrorCount).toBe(0);
    expect(code).toContain("(x, y) => x + y");
    expect(code).not.toContain("__PRISM_TODO(");
  });

  it("images an expression-position if with multi-statement branches as an invoked arrow", async () => {
    const { code, parseErrorCount } = await generateFromSource(
      `def g(flag)\n x = if flag\n  n = 1\n  n + 1\n else\n  0\n end\n x\nend`,
    );
    expect(parseErrorCount).toBe(0);
    expect(code).toContain("(() => {");
    expect(code).toContain("})()");
    expect(code).toContain("return n + 1;");
    expect(code).not.toContain("__PRISM_TODO(");
  });

  it("images chained rescues as one catch dispatching on the exception class", async () => {
    const { code, parseErrorCount } = await generateFromSource(
      `def g\n risky\nrescue Foo => err\n 1\nrescue Bar, Baz\n 2\nend`,
    );
    expect(parseErrorCount).toBe(0);
    expect(code).toContain("catch (e)");
    expect(code).toContain("caseEq(Foo, e)");
    expect(code).toContain("caseEq(Bar, e) || caseEq(Baz, e)");
    expect(code).toContain("const err = e;");
    expect(code).toContain("throw e;");
    expect(code).not.toContain("__PRISM_TODO(");
  });

  it("routes a multi-argument index get/set through the idxGet/idxSet helpers", async () => {
    const { code, parseErrorCount } = await generateFromSource(
      `def h(m); m[1, 2] = 3; m[1, 2]; end`,
    );
    expect(parseErrorCount).toBe(0);
    expect(code).not.toContain("m[1] = 3");
    expect(code).toContain('import { idxGet, idxSet } from "./runtime.js"');
    expect(code).toContain("idxSet(m, 1, 2, 3)");
    expect(code).toContain("idxGet(m, 1, 2)");
    expect(code).not.toContain("__PRISM_TODO(");
  });

  it("images <=> through the cmp helper and | / & through union / intersection", async () => {
    const { code, parseErrorCount } = await generateFromSource(
      `def f(a, b); (a <=> b) + (a | b) + (a & b); end`,
    );
    expect(parseErrorCount).toBe(0);
    expect(code).toContain('import { cmp, intersection, union } from "./runtime.js"');
    expect(code).toContain("cmp(a, b)");
    expect(code).toContain("union(a, b)");
    expect(code).toContain("intersection(a, b)");
  });

  it("images an operator sym-to-proc as a two-argument arrow", async () => {
    const { code, parseErrorCount } = await generateFromSource(
      `def f(list); list.reduce(&:+) + list.sort(&:<=>); end`,
    );
    expect(parseErrorCount).toBe(0);
    expect(code).toContain("(a, b) => a + b");
    expect(code).toContain("(a, b) => cmp(a, b)");
  });

  it("images the compound operators JS has no assignment token for", async () => {
    const { code, parseErrorCount } = await generateFromSource(`
      def f(list, seen, other)
        list <<= 1
        seen |= other
        seen &= other
        @count **= 2
        list
      end
    `);
    expect(parseErrorCount).toBe(0);
    expect(code).toContain("list.push(1)");
    expect(code).toContain("seen = union(seen, other)");
    expect(code).toContain("seen = intersection(seen, other)");
    expect(code).toContain("this.count **= 2");
  });

  it("declines a compound operator with no image without declaring its target", async () => {
    const { code, parseErrorCount } = await generateFromSource(`def f; y >>= 1; y; end`);
    expect(parseErrorCount).toBe(0);
    expect(code).toContain("__PRISM_TODO(");
    expect(code).not.toContain("let y");
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
    expect(code).toContain("this.orderValues.length === 0"); // parenless chain roots on this
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

  it("instantiates multi-arg expression-position raise, declining non-constant heads", async () => {
    const twoArg = await generateFromSource(
      `def check(x); x || raise(ArgumentError, "bad input"); end`,
    );
    expect(twoArg.parseErrorCount).toBe(0);
    expect(twoArg.code).toContain('throw new ArgumentError("bad input")');

    const dynamicHead = await generateFromSource(
      `def check2(x, klass); x || raise(klass, "bad"); end`,
    );
    expect(dynamicHead.parseErrorCount).toBe(0);
    expect(dynamicHead.code).not.toContain("throw klass");
    expect(dynamicHead.code).toContain("__PRISM_TODO(");
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
    const { coverage } = await generateFromSource(`def d(list); probe(9, &:=~); end`);
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
      def dirty(oc); oc =~ 1; end
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
  it("scopes the relation.ts supplement to the file's own Rails defs", async () => {
    const twinTs = `export const Calculations = { count: inQueryConnection(performCount) };
      export async function performCount() {}`;
    const relationTs = `class Relation {
      async pluck() {}
      async ids() {}
      async first() {}
      async isOne() {}
    }`;
    const ownRubyDefs = await scopedRubyDefs(`
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
  it("awaits calls into async methods defined in another port file", async () => {
    const manifest = buildAsyncManifest([
      { path: "persistence.ts", source: `export async function performSave() {}` },
      { path: "relation/finder-methods.ts", source: `export async function findBy() {}` },
    ]);
    const crossFile = crossFileAsyncNames(manifest, {
      twinTsPath: "persistence.ts",
      railsDefs: await scopedRubyDefs(`def find_by; end\ndef perform_save; end`),
    });
    expect(crossFile.has("findBy")).toBe(true);
    expect(crossFile.has("performSave")).toBe(false);
    const { code } = await generateFromSource(
      `module M
        def reload; self.find_by(1); end
      end`,
      resolveAsyncNames({ twinTs: `export async function reload() {}`, crossFile }),
    );
    expect(code).toContain("await this.findBy(1)");
  });
  it("marks a def in an unported file async when its body reaches a known-async name", async () => {
    const ruby = `module Touch
  def touch_later(*names)
    perform_save(names)
  end

  def touch_all(*names)
    touch_later(names)
  end

  def normalize(names)
    names.map(&:to_s)
  end
end`;
    const manifest = buildAsyncManifest([
      { path: "persistence.ts", source: `export async function performSave() {}` },
    ]);
    const crossFile = crossFileAsyncNames(manifest, {
      twinTsPath: "touch.ts",
      railsDefs: await scopedRubyDefs(`def perform_save; end`),
    });
    const names = resolveAsyncNames({ twinTs: "", crossFile, inferFromRuby: ruby });
    expect(names.has("touchLater")).toBe(true);
    expect(names.has("touchAll")).toBe(true);
    expect(names.has("normalize")).toBe(false);
    const { code } = await generateFromSource(ruby, names);
    expect(code).toContain("export async function touchLater");
    expect(code).toContain("await this.performSave(names)");
    expect(code).toContain("await this.touchLater(names)");
  });
  it("keeps a single-line def's body from running on to the next def", () => {
    const inferred = inferAsyncFromBodies(
      `module M
  def cached?; @cached; end

  def reload
    perform_save
  end
end`,
      new Set(["performSave"]),
    );
    expect(inferred.has("reload")).toBe(true);
    expect(inferred.has("isCached")).toBe(false);
  });
  it("ignores an async name that only appears in a comment", () => {
    const inferred = inferAsyncFromBodies(
      `def reset
  # unlike perform_save, this never touches the database
  @cache = nil
end`,
      new Set(["performSave"]),
    );
    expect(inferred.size).toBe(0);
  });
  it("ignores an async name that only appears inside a string literal", () => {
    const inferred = inferAsyncFromBodies(
      `def reset
  raise ArgumentError, "cannot perform_save while resetting"
end

def label
  'perform_save'
end`,
      new Set(["performSave"]),
    );
    expect(inferred.size).toBe(0);
  });
  it("still infers from a call inside string interpolation", () => {
    const inferred = inferAsyncFromBodies(
      `def describe
  "saved as #{perform_save}"
end`,
      new Set(["performSave"]),
    );
    expect(inferred.has("describe")).toBe(true);
  });
  it("infers nothing when no body reaches an unambiguous async name", () => {
    const inferred = inferAsyncFromBodies(
      `def reset
  clear_cache
end`,
      new Set(),
    );
    expect(inferred.size).toBe(0);
  });
  it("declines the await when a name is async in more than one port file", async () => {
    const manifest = buildAsyncManifest([
      { path: "relation.ts", source: `class R { async reset() {} }` },
      { path: "connection-adapters/pool.ts", source: `class P { async reset() {} }` },
      { path: "persistence.ts", source: `export async function touch() {}` },
    ]);
    const railsDefs = await scopedRubyDefs(`def reset; end\ndef touch; end`);
    const crossFile = crossFileAsyncNames(manifest, { twinTsPath: "core.ts", railsDefs });
    expect(crossFile.has("reset")).toBe(false);
    expect(crossFile.has("touch")).toBe(true);
  });
  it("keeps cross-file async names out unless Rails defines the method", async () => {
    const manifest = buildAsyncManifest([
      { path: "relation.ts", source: `class R { async then() {} }` },
    ]);
    const crossFile = crossFileAsyncNames(manifest, {
      twinTsPath: "core.ts",
      railsDefs: await scopedRubyDefs(`def save; end`),
    });
    expect(crossFile.has("then")).toBe(false);
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

  it("resolves a delegate macro's methods through their receiver, not this", async () => {
    const { code } = await generateFromSource(`
      class Relation
        delegate :primary_key, :table_name, to: :model
        delegate :length, to: :records

        def describe
          "#{table_name}.#{primary_key} (#{length})"
        end
      end
    `);
    expect(code).toContain("this.model.tableName");
    expect(code).toContain("this.model.primaryKey");
    expect(code).toContain("this.records.length");
  });

  it("lets a real definition win over the delegate macro of the same name", async () => {
    const { code } = await generateFromSource(`
      class Relation
        delegate :primary_key, to: :model

        def primary_key
          @primary_key
        end

        def describe
          primary_key
        end
      end
    `);
    expect(code).toContain("return this.primaryKey;");
    expect(code).not.toContain("this.model.primaryKey");
  });

  it("delegation tables inherit into the file family they are compiled into", async () => {
    const inherited = await delegationsFromSource(`
      module Delegation
        delegate :primary_key, to: :model
      end
    `);
    expect([...inherited]).toEqual([["primaryKey", "model"]]);
    const { code } = await generateFromSource(
      `class Relation; def describe; primary_key; end; end`,
      undefined,
      undefined,
      inherited,
    );
    expect(code).toContain("this.model.primaryKey");
  });

  it("keeps a falsy prefix option in the table", async () => {
    const { code } = await generateFromSource(`
      class Relation
        delegate :primary_key, to: :model, prefix: false
        delegate :table_name, to: :model, prefix: nil

        def describe
          [primary_key, table_name]
        end
      end
    `);
    expect(code).toContain("this.model.primaryKey");
    expect(code).toContain("this.model.tableName");
  });

  it("a singleton def does not suppress an instance delegation of the same name", async () => {
    const { code } = await generateFromSource(`
      class Relation
        delegate :primary_key, to: :model

        def self.primary_key
          @primary_key
        end

        def describe
          primary_key
        end
      end
    `);
    expect(code).toContain("return this.model.primaryKey;");
  });

  it("leaves a prefixed delegate macro out of the table", async () => {
    const { code } = await generateFromSource(`
      class Relation
        delegate :primary_key, to: :model, prefix: true

        def describe
          primary_key
        end
      end
    `);
    expect(code).toContain("return this.primaryKey;");
    expect(code).not.toContain("this.model.primaryKey");
  });

  it("resolves an instance delegation only for instance methods", async () => {
    const { code } = await generateFromSource(`
      class Relation
        delegate :primary_key, to: :model

        def self.describe
          primary_key
        end

        class << self
          delegate :table_name, to: :arel_table
        end

        def name
          table_name
        end
      end
    `);
    expect(code).toContain("static describe()");
    expect(code).not.toContain("this.model.primaryKey");
    expect(code).not.toContain("this.arelTable.tableName");
  });
});
