import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const HERE = __dirname;

// The Ruby extractor is exercised through its real Ripper parser (shelled out)
// so the test pins the exact production behavior, not a re-implementation. The
// script guards its env-dependent setup and auto-run behind
// `__FILE__ == $PROGRAM_NAME`, so it is safe to `require_relative` here and
// drive ApiExtractor directly.
// Every case here shells out to a real `ruby` process through Ripper, so a case
// costs a process spawn plus parse (~300-500ms locally) rather than the
// microseconds vitest's default 5s timeout is tuned for. On a loaded 4-vCPU CI
// runner that budget is thin enough to lose the race — it has timed out on a
// case whose assertions were never reached — so the whole subprocess-driven
// describe gets a wider one.
const RUBY_SUBPROCESS_TIMEOUT_MS = 30_000;

describe("Ruby extractor body call capture", { timeout: RUBY_SUBPROCESS_TIMEOUT_MS }, () => {
  const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

  // Returns a map of "<fqn>#<method>" -> the named method_info array for the
  // given fixtures.
  function rubyField(
    fixtures: Record<string, string>,
    field: string,
  ): Record<string, string[] | undefined> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "calls-rb-"));
    try {
      for (const [rel, src] of Object.entries(fixtures)) {
        const p = path.join(dir, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, src);
      }
      const rels = JSON.stringify(Object.keys(fixtures));
      const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        ex = ApiExtractor.new
        JSON.parse(${JSON.stringify(rels)}).each do |rel|
          ex.process_file(File.join(${JSON.stringify(dir)}, rel), ${JSON.stringify(dir)})
        end
        out = {}
        ex.classes.each do |fqn, info|
          (info[:instanceMethods] + info[:classMethods]).each do |m|
            out["#{fqn}##{m[:name]}"] = m[${JSON.stringify(field)}.to_sym]
          end
        end
        puts JSON.generate(out)
      `;
      const stdout = execFileSync("ruby", ["-e", driver], { encoding: "utf-8" });
      return JSON.parse(stdout);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  function rubyCalls(fixtures: Record<string, string>): Record<string, string[] | undefined> {
    return rubyField(fixtures, "calls");
  }

  function rubySkeletons(fixtures: Record<string, string>): Record<string, string[] | undefined> {
    return rubyField(fixtures, "skeleton");
  }

  it("emits an ordered control + call skeleton, with duplicates, alongside calls", () => {
    const s = rubySkeletons({
      "foo.rb": `
        class Foo
          def create(xs)
            raise Boom if dirty
            xs.each { |x| save(x) }
            begin
              save(xs[0])
            rescue StandardError
              rollback
            end
          end

          def build
            cached || Thing.new
          end
        end
      `,
    });
    expect(s["Foo#create"]).toEqual([
      "if",
      "ref:dirty",
      "throw",
      "ref:each",
      "ref:save",
      "try",
      "ref:save",
      "ref:get",
      "ref:rollback",
    ]);
    expect(s["Foo#build"]).toEqual(["ref:cached", "if", "new:Thing"]);
  });

  it("reads a named capture bound by `=~` as a local, not a call", () => {
    const fixtures = {
      "foo.rb": `
        class Foo
          def prepare_column_options(column)
            spec = super
            if /\\A(?<size>tiny|medium|long)(?:text|blob)/ =~ column.sql_type
              spec = { size: size.to_sym.inspect }.merge!(spec)
            end
            spec
          end
        end
      `,
    };
    expect(rubyCalls(fixtures)["Foo#prepare_column_options"]).toEqual([
      "super",
      "sql_type",
      "to_sym",
      "inspect",
      "merge!",
    ]);
    expect(rubySkeletons(fixtures)["Foo#prepare_column_options"]).toEqual([
      "ref:super",
      "if",
      "ref:sql_type",
      "ref:to_sym",
      "ref:inspect",
      "ref:merge!",
    ]);
  });

  it("only binds the capture for the rest of the method, not the lines before it", () => {
    // The skeleton keeps duplicates, so it distinguishes the pre-binding read
    // (still a call) from the post-binding one (a local) where the uniq'd
    // call-set cannot.
    const s = rubySkeletons({
      "foo.rb": `
        class Foo
          def check(str)
            size
            /(?<size>tiny)/ =~ str
            size
          end
        end
      `,
    });
    expect(s["Foo#check"]).toEqual(["ref:size"]);
  });

  it("still reads a bare name as a call when the regexp is on the right of `=~`", () => {
    const c = rubyCalls({
      "foo.rb": `
        class Foo
          def check(s)
            s =~ /(?<size>tiny)/
            size
          end
        end
      `,
    });
    expect(c["Foo#check"]).toEqual(["size"]);
  });

  it("emits a chained call's refs in evaluation order, receiver first", () => {
    const s = rubySkeletons({
      "foo.rb": `
        class Foo
          def through_scope
            scope = through_reflection.klass.unscoped
            Preloader.new(scope: scope).loaders
          end
        end
      `,
    });
    expect(
      rubyCalls({
        "foo.rb": `
        class Foo
          def through_scope
            scope = through_reflection.klass.unscoped
            Preloader.new(scope: scope).loaders
          end
        end
      `,
      })["Foo#through_scope"],
    ).toEqual(["through_reflection", "klass", "unscoped", "new", "loaders"]);
    expect(s["Foo#through_scope"]).toEqual([
      "ref:through_reflection",
      "ref:klass",
      "ref:unscoped",
      "new:Preloader",
      "ref:loaders",
    ]);
  });

  it("emits a nested argument before the call it is passed to", () => {
    // Ruby EVALUATION order (collection_association.rb:121): the argument runs
    // first, so the port's `await`-forced hoist into a local records the same
    // sequence as the nested spelling. extract-ts-api.ts#collectCalls agrees.
    const c = rubyCalls({
      "foo.rb": `
        class Foo
          def build(attributes)
            add_to_target(build_record(attributes), replace: true)
          end

          def block_body(xs)
            xs.each { |x| save(x) }
          end

          def lambda_arg
            scope :active, -> { where(status: 0) }
          end
        end
      `,
    });
    expect(c["Foo#build"]).toEqual(["build_record", "add_to_target"]);
    // A block, and the lambda literal that is a block in all but name, still
    // follow the call they hang off — the port spells both as the callback
    // argument the TS side defers, or as a `for` body.
    expect(c["Foo#block_body"]).toEqual(["each", "save"]);
    expect(c["Foo#lambda_arg"]).toEqual(["scope", "where"]);
  });

  it('records super(args) and bare super as a "super" call', () => {
    const c = rubyCalls({
      "foo.rb": `
        class Foo
          def save
            super
            run_callbacks(:save)
          end

          def reload
            super(force: true)
          end
        end
      `,
    });
    expect(c["Foo#save"]).toContain("super");
    expect(c["Foo#save"]).toContain("run_callbacks");
    expect(c["Foo#reload"]).toContain("super");
  });

  it("does not synthesize a super call when the body never chains", () => {
    const c = rubyCalls({
      "bar.rb": `
        class Bar
          def touch
            run_callbacks(:touch)
          end
        end
      `,
    });
    expect(c["Bar#touch"]).not.toContain("super");
    expect(c["Bar#touch"]).toContain("run_callbacks");
  });
});

describe(
  "Ruby extractor inert-receiver call suppression",
  { timeout: RUBY_SUBPROCESS_TIMEOUT_MS },
  () => {
    const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

    // Returns a map of "<fqn>#<method>" -> { calls, weakCalls }.
    function rubyWeakCalls(
      fixtures: Record<string, string>,
    ): Record<string, { calls?: string[]; weakCalls?: string[] }> {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weak-rb-"));
      try {
        for (const [rel, src] of Object.entries(fixtures)) {
          const p = path.join(dir, rel);
          fs.mkdirSync(path.dirname(p), { recursive: true });
          fs.writeFileSync(p, src);
        }
        const rels = JSON.stringify(Object.keys(fixtures));
        const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        ex = ApiExtractor.new
        JSON.parse(${JSON.stringify(rels)}).each do |rel|
          ex.process_file(File.join(${JSON.stringify(dir)}, rel), ${JSON.stringify(dir)})
        end
        out = {}
        ex.classes.each do |fqn, info|
          (info[:instanceMethods] + info[:classMethods]).each do |m|
            out["#{fqn}##{m[:name]}"] = { calls: m[:calls], weakCalls: m[:weakCalls] }
          end
        end
        puts JSON.generate(out)
      `;
        const stdout = execFileSync("ruby", ["-e", driver], { encoding: "utf-8" });
        return JSON.parse(stdout);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    it("marks local-variable and literal receivers weak", () => {
      const c = rubyWeakCalls({
        "foo.rb": `
        class Foo
          def a(opts)
            xs = [1]
            xs.first
            opts.fetch(:k)
            {}.merge(other)
            "s".upcase
            :sym.to_proc
            1.to_s
          end
        end
      `,
      });
      expect(c["Foo#a"].weakCalls?.sort()).toEqual(
        ["fetch", "first", "merge", "to_proc", "to_s", "upcase"].sort(),
      );
    });

    it("suppresses a paren-less qualified call on a local variable", () => {
      // `opts.assert_valid_keys :a` parses as :command_call, not :call — the
      // receiver check has to cover both or half the noise survives.
      const c = rubyWeakCalls({
        "cmd.rb": `
        class Cmd
          def d(opts)
            opts.assert_valid_keys :a
          end

          def e
            @config.assert_valid_keys :b
          end
        end
      `,
      });
      expect(c["Cmd#d"].weakCalls).toEqual(["assert_valid_keys"]);
      expect(c["Cmd#e"].calls).toContain("assert_valid_keys");
      expect(c["Cmd#e"].weakCalls ?? []).toEqual([]);
    });

    it("still records self, ivar, constant and method-chain receivers", () => {
      const c = rubyWeakCalls({
        "bar.rb": `
        class Bar
          def b
            self.save
            @association.reader
            Baz.build
            owner.target.destroy
          end
        end
      `,
      });
      expect(c["Bar#b"].calls).toEqual(
        expect.arrayContaining(["save", "reader", "build", "destroy"]),
      );
      expect(c["Bar#b"].weakCalls ?? []).toEqual([]);
    });

    it("keeps a name significant when any occurrence has a live receiver", () => {
      const c = rubyWeakCalls({
        "baz.rb": `
        class Baz
          def c(list)
            list.save
            owner.save
          end
        end
      `,
      });
      expect(c["Baz#c"].calls).toContain("save");
      expect(c["Baz#c"].weakCalls ?? []).not.toContain("save");
    });

    it("drops a Ruby core method call in a core_ext body but keeps a ported one", () => {
      const c = rubyWeakCalls({
        "lib/active_support/core_ext/array/access.rb": `
        class Array
          def sole
            case count
            when 1 then return first
            end
            in_groups_of(2)
          end
        end
      `,
      });
      // `count`/`first` are Ruby core on the reopened receiver; `in_groups_of` is
      // an ActiveSupport extension the port really does have to call.
      expect(c["Array#sole"].weakCalls?.sort()).toEqual(["count", "first"]);
      expect(c["Array#sole"].calls).toContain("in_groups_of");
    });

    it("keeps a Ruby core method name significant outside core_ext", () => {
      const c = rubyWeakCalls({
        "lib/active_record/relation.rb": `
        class Relation
          def sole
            count
            first
          end
        end
      `,
      });
      expect(c["Relation#sole"].weakCalls ?? []).toEqual([]);
    });

    it("drops a Ruby core call on an Array-literal constant receiver", () => {
      const c = rubyWeakCalls({
        "lib/active_support/inflector/transliterate.rb": `
        class Inflector
          ALLOWED = [Encoding::UTF_8, Encoding::US_ASCII].freeze

          def transliterate(string)
            raise ArgumentError unless ALLOWED.include?(string)
          end

          def rules(string)
            I18N_RULES.include?(string)
          end
        end
      `,
      });
      // `ALLOWED` is an Array literal, so its `include?` is Array#include?;
      // `I18N_RULES` is not a literal collection in this file, so its `include?`
      // is still a call to a ported collaborator.
      expect(c["Inflector#transliterate"].weakCalls).toEqual(["include?"]);
      expect(c["Inflector#rules"].weakCalls ?? []).toEqual([]);
    });

    it("drops a Module method called unqualified inside a module_eval block", () => {
      const c = rubyWeakCalls({
        "lib/active_support/deprecation/method_wrappers.rb": `
        class MethodWrappers
          def deprecate_methods(target_module, method_name)
            target_module.module_eval do
              redefine_method(method_name) { deprecation_warning(method_name) }
              define_method(method_name) { }
            end
            define_method(method_name)
          end
        end
      `,
      });
      // `self` inside the block is the module, so `define_method` /
      // `redefine_method` there are Ruby metaprogramming; the same names outside
      // the block, and the ported `deprecation_warning`, stay significant.
      expect(c["MethodWrappers#deprecate_methods"].weakCalls?.sort()).toEqual([
        "module_eval",
        "redefine_method",
      ]);
      expect(c["MethodWrappers#deprecate_methods"].calls).toContain("define_method");
      expect(c["MethodWrappers#deprecate_methods"].calls).toContain("deprecation_warning");
    });

    it("drops a call on a Ruby core class constant receiver", () => {
      const c = rubyWeakCalls({
        "lib/active_support/file_utils.rb": `
        class Writer
          def write(path)
            File.stat(path)
            Module.new
            Baz.stat(path)
          end
        end
      `,
      });
      expect(c["Writer#write"].weakCalls?.sort()).toEqual(["new"]);
      expect(c["Writer#write"].calls).toContain("stat");
    });

    it("drops new at a Proc receiver while keeping it at a constant receiver", () => {
      const c = rubyWeakCalls({
        "qux.rb": `
        class Qux
          def d
            callback = Proc.new { |x| x.run }
            Wrapper.new(callback)
          end
        end
      `,
      });
      // `Proc.new { ... }` ports to an arrow function, which names no callee, so
      // the site can never be satisfied; `Wrapper.new` is a real construction the
      // TS side records as `constructor`.
      expect(c["Qux#d"].calls).toContain("new");
      expect(c["Qux#d"].calls?.filter((n) => n === "new")).toEqual(["new"]);
      expect(c["Qux#d"].calls).toContain("run");
    });

    it("drops the new a raise builds its error with, keeping any other new", () => {
      const c = rubyWeakCalls({
        "raiser.rb": `
        class Raiser
          def f
            raise ArgumentError.new("bad") unless ok?
            Wrapper.new(build)
          end
        end
      `,
      });
      // `raise Foo.new(msg)` and `raise Foo, msg` are one raise written two ways,
      // and the port spells both `throw new Foo(msg)` — so the raise's own `new`
      // carries no position (extract-ts-api.ts#isThrownConstruction drops the TS
      // half). `Wrapper.new` still does, and lands after `ok?`.
      expect(c["Raiser#f"].calls).toEqual(["ok?", "raise", "build", "new"]);
    });

    it("drops new entirely when Proc is the only receiver", () => {
      const c = rubyWeakCalls({
        "quux.rb": `
        class Quux
          def e
            Proc.new { greet }
          end
        end
      `,
      });
      expect(c["Quux#e"].calls ?? []).not.toContain("new");
      expect(c["Quux#e"].calls).toContain("greet");
    });
  },
);

describe(
  "Ruby extractor call-argument Proc.new suppression",
  { timeout: RUBY_SUBPROCESS_TIMEOUT_MS },
  () => {
    const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

    // Returns a map of "<fqn>#<method>" -> the recorded call sites' names.
    function rubyCallSiteNames(fixtures: Record<string, string>): Record<string, string[]> {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "args-rb-"));
      try {
        for (const [rel, src] of Object.entries(fixtures)) {
          const p = path.join(dir, rel);
          fs.mkdirSync(path.dirname(p), { recursive: true });
          fs.writeFileSync(p, src);
        }
        const rels = JSON.stringify(Object.keys(fixtures));
        const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        ex = ApiExtractor.new
        JSON.parse(${JSON.stringify(rels)}).each do |rel|
          ex.process_file(File.join(${JSON.stringify(dir)}, rel), ${JSON.stringify(dir)})
        end
        out = {}
        ex.classes.each do |fqn, info|
          (info[:instanceMethods] + info[:classMethods]).each do |m|
            out["#{fqn}##{m[:name]}"] = (m[:callArgs] || []).map { |s| s[:name] }
          end
        end
        puts JSON.generate(out)
      `;
        const stdout = execFileSync("ruby", ["-e", driver], { encoding: "utf-8" });
        return JSON.parse(stdout);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    it("drops the Proc.new site while keeping a constant-receiver new site", () => {
      const c = rubyCallSiteNames({
        "qux.rb": `
        class Qux
          def d
            callback = Proc.new { |x| x.run }
            Wrapper.new(callback)
          end
        end
      `,
      });
      expect(c["Qux#d"].filter((n) => n === "new")).toEqual(["new"]);
      expect(c["Qux#d"]).toContain("run");
    });

    it("drops the new site entirely when Proc is the only receiver", () => {
      const c = rubyCallSiteNames({
        "quux.rb": `
        class Quux
          def e
            Proc.new { greet }
          end
        end
      `,
      });
      expect(c["Quux#e"]).not.toContain("new");
      expect(c["Quux#e"]).toContain("greet");
    });
  },
);

describe("Ruby extractor alias arity resolution", { timeout: RUBY_SUBPROCESS_TIMEOUT_MS }, () => {
  const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

  // Returns a map of "<fqn>#<method>" -> param-name array after running
  // resolve_aliases!, plus the method's `notes`/`alias_target` keys.
  function aliasParams(
    fixtures: Record<string, string>,
  ): Record<
    string,
    { params: string[]; notes?: string; aliasResolved?: boolean; hasAliasTarget: boolean }
  > {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alias-rb-"));
    try {
      for (const [rel, src] of Object.entries(fixtures)) {
        const p = path.join(dir, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, src);
      }
      const rels = JSON.stringify(Object.keys(fixtures));
      const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        ex = ApiExtractor.new
        JSON.parse(${JSON.stringify(rels)}).each do |rel|
          ex.process_file(File.join(${JSON.stringify(dir)}, rel), ${JSON.stringify(dir)})
        end
        ex.resolve_aliases!
        out = {}
        (ex.classes.to_a + ex.modules.to_a).each do |fqn, info|
          (info[:instanceMethods] + info[:classMethods]).each do |m|
            out["#{fqn}##{m[:name]}"] = {
              params: m[:params].map { |p| p[:name] },
              notes: m[:notes],
              aliasResolved: m[:aliasResolved],
              hasAliasTarget: m.key?(:alias_target),
            }
          end
        end
        puts JSON.generate(out)
      `;
      const stdout = execFileSync("ruby", ["-e", driver], { encoding: "utf-8" });
      return JSON.parse(stdout);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("copies the target's params onto a bare `alias` (arel visitor pattern)", () => {
    const r = aliasParams({
      "v.rb": `
        module Arel
          module Visitors
            class ToSql
              def unsupported(o, collector); end
              def visit_Array(o, collector); end
              alias :visit_String :unsupported
              alias :visit_Set :visit_Array
            end
          end
        end
      `,
    });
    // The alias keeps its note but now reports the target's 2-arg arity, so a
    // faithful TS delegator `visitString(o, collector)` no longer false-flags.
    expect(r["Arel::Visitors::ToSql#visit_String"]).toMatchObject({
      params: ["o", "collector"],
      notes: "alias",
    });
    expect(r["Arel::Visitors::ToSql#visit_Set"].params).toEqual(["o", "collector"]);
    // The transient resolution key never reaches the manifest.
    expect(r["Arel::Visitors::ToSql#visit_String"].hasAliasTarget).toBe(false);
  });

  it("copies the target's params onto an `alias_method`", () => {
    const r = aliasParams({
      "m.rb": `
        class Foo
          def original(a, b = 1); end
          alias_method :renamed, :original
        end
      `,
    });
    expect(r["Foo#renamed"].params).toEqual(["a", "b"]);
  });

  it("buckets a singleton `alias_method` as a class method and resolves it", () => {
    // ActiveSupport::JSON pattern: `class << self; alias_method :dump, :encode; end`.
    // Both the alias and its target are class methods, so the resolver must
    // search the classMethods bucket.
    const r = aliasParams({
      "j.rb": `
        module Encoding
          class << self
            def encode(value, options = nil); end
            alias_method :dump, :encode
          end
        end
      `,
    });
    expect(r["Encoding#dump"]).toMatchObject({ params: ["value", "options"], notes: "alias" });
  });

  it("resolves a target defined in an included module", () => {
    const r = aliasParams({
      "mix.rb": `
        module Pkg
          module Delegation
            def to_ary(limit = nil); end
          end

          class Relation
            include Delegation
            alias :to_a :to_ary
          end
        end
      `,
    });
    expect(r["Pkg::Relation#to_a"]).toMatchObject({ params: ["limit"], notes: "alias" });
  });

  it("resolves an alias whose mixin target is itself an unresolved alias", () => {
    // The host's alias points at `to_ary`, which is itself only an alias inside
    // the module. Resolution must not depend on the module happening to be
    // visited before the host — hence the global fixpoint rather than a
    // per-class sweep. `zz_` sorts the module after the host to make a
    // hash-order-dependent implementation fail here.
    const r = aliasParams({
      "chain.rb": `
        module Pkg
          class Relation
            include ZzDelegation
            alias :to_a :to_ary
          end

          module ZzDelegation
            def records(limit, offset); end
            alias :to_ary :records
          end
        end
      `,
    });
    expect(r["Pkg::Relation#to_a"].params).toEqual(["limit", "offset"]);
  });

  it("resolves a target inherited from a superclass", () => {
    const r = aliasParams({
      "sup.rb": `
        class Parent
          def compute(a, b); end
        end

        class Child < Parent
          alias :calc :compute
        end
      `,
    });
    expect(r["Child#calc"].params).toEqual(["a", "b"]);
  });

  it("resolves a class-method target through `extend`", () => {
    const r = aliasParams({
      "ext.rb": `
        module Builders
          def build(scope, opts = {}); end
        end

        class Host
          extend Builders
          class << self
            alias_method :create, :build
          end
        end
      `,
    });
    expect(r["Host#create"].params).toEqual(["scope", "opts"]);
  });

  it("prefers an included module's method over the superclass's", () => {
    // Ruby inserts included modules between the class and its superclass, so
    // `Mixin#target` wins over `Parent#target`.
    const r = aliasParams({
      "order.rb": `
        class Parent
          def target(from_superclass); end
        end

        module Mixin
          def target(from_mixin, extra); end
        end

        class Child < Parent
          include Mixin
          alias :aka :target
        end
      `,
    });
    expect(r["Child#aka"].params).toEqual(["from_mixin", "extra"]);
  });

  it("prefers the last `include` statement, but the first name within one", () => {
    // ancestors == [Host, Late, EarlyA, EarlyB]: a later `include` beats an
    // earlier one, while `include EarlyA, EarlyB` puts EarlyA ahead of EarlyB.
    const r = aliasParams({
      "ancestry.rb": `
        module EarlyA
          def target(early_a); end
        end
        module EarlyB
          def target(early_b); end
        end
        module Late
          def target(late); end
        end

        class Host
          include EarlyA, EarlyB
          include Late
          alias :aka :target
        end

        class Sibling
          include EarlyA, EarlyB
          alias :aka :target
        end
      `,
    });
    expect(r["Host#aka"].params).toEqual(["late"]);
    expect(r["Sibling#aka"].params).toEqual(["early_a"]);
  });

  it("resolves an unqualified mixin lexically before the top level", () => {
    // The ActiveRecord::Relation case: `include Delegation` inside
    // `ActiveRecord::Relation` must find `ActiveRecord::Delegation`, not a
    // top-level `::Delegation`.
    const r = aliasParams({
      "lex.rb": `
        module Delegation
          def target(top_level); end
        end

        module ActiveRecord
          module Delegation
            def target(nested, other); end
          end

          class Relation
            include Delegation
            alias :aka :target
          end
        end
      `,
    });
    expect(r["ActiveRecord::Relation#aka"].params).toEqual(["nested", "other"]);
  });

  it("resolves a leading :: mixin against the top level, skipping lexical scope", () => {
    // Ruby's `::` forces an absolute lookup, so `include ::Delegation` binds to
    // top-level `Delegation` even though `ActiveRecord::Delegation` exists and
    // would win for the unqualified `include Delegation` above.
    const r = aliasParams({
      "abs.rb": `
        module Delegation
          def target(top_level); end
        end

        module ActiveRecord
          module Delegation
            def target(nested, other); end
          end

          class Relation
            include ::Delegation
            alias :aka :target
          end
        end
      `,
    });
    expect(r["ActiveRecord::Relation#aka"].params).toEqual(["top_level"]);
  });

  it("resolves a leading :: on a qualified mixin against the top level", () => {
    // `::Outer::Mixin` is `const_path_ref(top_const_ref(Outer), Mixin)` — the
    // `::` sits on the leftmost segment, so absoluteness must be detected
    // through the qualifier nesting, not just on a bare `::Foo`.
    const r = aliasParams({
      "abs_path.rb": `
        module Outer
          module Mixin
            def target(top_level); end
          end
        end

        module ActiveRecord
          module Outer
            module Mixin
              def target(nested, other); end
            end
          end

          class Relation
            include ::Outer::Mixin
            alias :aka :target
          end
        end
      `,
    });
    expect(r["ActiveRecord::Relation#aka"].params).toEqual(["top_level"]);
  });

  it("resolves a qualified mixin without :: lexically", () => {
    // The same shape as above minus the `::` — `const_path_ref(var_ref(Outer),
    // Mixin)` must still prefer the lexically nearer definition.
    const r = aliasParams({
      "rel_path.rb": `
        module Outer
          module Mixin
            def target(top_level); end
          end
        end

        module ActiveRecord
          module Outer
            module Mixin
              def target(nested, other); end
            end
          end

          class Relation
            include Outer::Mixin
            alias :aka :target
          end
        end
      `,
    });
    expect(r["ActiveRecord::Relation#aka"].params).toEqual(["nested", "other"]);
  });

  it("resolves a leading :: superclass against the top level", () => {
    const r = aliasParams({
      "abs_sup.rb": `
        class Base
          def target(top_level); end
        end

        module ActiveRecord
          class Base
            def target(nested, other); end
          end

          class Relation < ::Base
            alias :aka :target
          end
        end
      `,
    });
    expect(r["ActiveRecord::Relation#aka"].params).toEqual(["top_level"]);
  });

  it("prefers a same-bucket definition over an inherited one", () => {
    const r = aliasParams({
      "shadow.rb": `
        module Mixin
          def target(wrong); end
        end

        class Owner
          include Mixin
          def target(right, also); end
          alias :aka :target
        end
      `,
    });
    expect(r["Owner#aka"].params).toEqual(["right", "also"]);
  });

  it("leaves an alias empty when its ancestors are outside the package", () => {
    const r = aliasParams({
      "out.rb": `
        class Orphan < SomeGem::Base
          include SomeGem::Mixin
          alias :local :elsewhere
        end
      `,
    });
    expect(r["Orphan#local"]).toMatchObject({ params: [], notes: "alias", hasAliasTarget: false });
  });

  it("follows an alias chain (alias of an alias)", () => {
    const r = aliasParams({
      "c.rb": `
        class Bar
          def base(x, y); end
          alias :mid :base
          alias :tip :mid
        end
      `,
    });
    expect(r["Bar#tip"].params).toEqual(["x", "y"]);
  });

  it("resolves a target defined in a reopened class in another file", () => {
    const r = aliasParams({
      "a-def.rb": `
        class Reopened
          def target(p); end
        end
      `,
      "b-alias.rb": `
        class Reopened
          alias :alt :target
        end
      `,
    });
    expect(r["Reopened#alt"].params).toEqual(["p"]);
  });

  it("flags an alias resolved to a zero-arg target as resolved", () => {
    // `params: []` here is the TARGET's real (empty) arity, not a placeholder —
    // `aliasResolved` is what tells arity.ts the pair is still checkable.
    const r = aliasParams({
      "z.rb": `
        class Zero
          def original; end
          alias_method :renamed, :original
        end
      `,
    });
    expect(r["Zero#renamed"]).toMatchObject({
      params: [],
      notes: "alias",
      aliasResolved: true,
    });
  });

  it("leaves an alias to a `delegate`-generated target unresolved", () => {
    // The delegate's `params: []` means "arity unknown", so an alias to it is
    // just as unknown — marking it resolved would re-arm the false mismatches
    // the arity skip removes, one hop away through the alias.
    const r = aliasParams({
      "c.rb": `
        module Pkg
          class Relation
            delegate :in_groups_of, to: :records
            alias_method :grouped, :in_groups_of
          end
        end
      `,
    });
    expect(r["Pkg::Relation#in_groups_of"]).toMatchObject({ params: [], notes: "delegate" });
    expect(r["Pkg::Relation#grouped"]).toMatchObject({ params: [], notes: "alias" });
    expect(r["Pkg::Relation#grouped"].aliasResolved).toBeFalsy();
  });

  it("leaves an alias to an out-of-package target empty (best effort)", () => {
    const r = aliasParams({
      "u.rb": `
        class Lonely
          alias :gone :inherited_from_elsewhere
        end
      `,
    });
    expect(r["Lonely#gone"]).toMatchObject({ params: [], notes: "alias" });
    // Never resolved — the flag stays unset (the test driver renders nil as null).
    expect(r["Lonely#gone"].aliasResolved).toBeFalsy();
  });

  // The `notes` tag is the CONTRACT the arity check keys off (arity.ts
  // `isForwardingRubyEntry` drops these pairs). Renaming the tag here without
  // updating that predicate would silently re-arm ~22 false mismatches, so the
  // exact string is pinned on both forwarding kinds.
  it("tags a `delegate`-generated method with empty placeholder params", () => {
    const r = aliasParams({
      "d.rb": `
        module Pkg
          module Querying
            delegate :create_or_find_by, :in_groups_of, to: :all
          end
        end
      `,
    });
    expect(r["Pkg::Querying#create_or_find_by"]).toMatchObject({
      params: [],
      notes: "delegate",
    });
    expect(r["Pkg::Querying#in_groups_of"]).toMatchObject({ params: [], notes: "delegate" });
  });

  // Forwardable's `def_delegators :@errors, :each, …` (activemodel errors.rb:103)
  // is the other generated-forwarding form. The accessor is the leading ivar
  // symbol and is NOT a generated method; every symbol after it is.
  it("records each `def_delegators` symbol after the ivar accessor", () => {
    const r = aliasParams({
      "e.rb": `
        module Pkg
          class Errors
            extend Forwardable
            def_delegators :@errors, :each, :clear, :empty?, :size, :uniq!
          end
        end
      `,
    });
    expect(r["Pkg::Errors#each"]).toMatchObject({ params: [], notes: "delegate" });
    expect(r["Pkg::Errors#uniq!"]).toMatchObject({ params: [], notes: "delegate" });
    expect(r["Pkg::Errors#empty?"]).toMatchObject({ params: [], notes: "delegate" });
    expect(r["Pkg::Errors#@errors"]).toBeUndefined();
  });
});

describe(
  "Ruby extractor umbrella module-config scanning",
  { timeout: RUBY_SUBPROCESS_TIMEOUT_MS },
  () => {
    const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

    // Lay out a package libPath with a `base.rb` and a sibling umbrella file
    // one level above it, scan the package then the umbrella, and return the
    // ActiveRecord::Base / ActiveRecord entries.
    function scanWithUmbrella(
      baseSrc: string,
      umbrellaSrc: string,
      full = false,
    ): Record<string, ClassEntry> {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "umbrella-rb-"));
      try {
        const libPath = path.join(root, "active_record");
        fs.mkdirSync(libPath, { recursive: true });
        fs.writeFileSync(path.join(libPath, "base.rb"), baseSrc);
        fs.writeFileSync(path.join(root, "active_record.rb"), umbrellaSrc);
        const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        ex = ApiExtractor.new
        ex.process_file(File.join(${JSON.stringify(libPath)}, "base.rb"), ${JSON.stringify(libPath)})
        ex.scan_umbrella_file(File.join(${JSON.stringify(root)}, "active_record.rb"), ${JSON.stringify(libPath)}, full: ${full})
        out = {}
        (ex.classes.merge(ex.modules)).each do |fqn, info|
          out[fqn] = { classMethods: info[:classMethods], instanceMethods: info[:instanceMethods], file: info[:file] }
        end
        puts JSON.generate(out)
      `;
        const stdout = execFileSync("ruby", ["-e", driver], { encoding: "utf-8" });
        return JSON.parse(stdout);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }

    interface ClassEntry {
      classMethods: { name: string; umbrellaConfig?: boolean }[];
      instanceMethods: { name: string; visibility: string }[];
      file: string;
    }

    const BASE_SRC = `
    module ActiveRecord
      class Base
        def save; end
      end
    end
  `;

    it("attributes module-level singleton_class config to <Module>::Base, tagged umbrellaConfig", () => {
      const out = scanWithUmbrella(
        BASE_SRC,
        `
      module ActiveRecord
        singleton_class.attr_accessor :writing_role
        singleton_class.attr_reader :default_timezone
        def self.eager_load!; end
      end
    `,
      );
      const base = out["ActiveRecord::Base"];
      const names = base.classMethods.map((m) => m.name);
      // accessor → reader + writer; reader-only → reader only.
      expect(names).toContain("writing_role");
      expect(names).toContain("writing_role=");
      expect(names).toContain("default_timezone");
      expect(names).not.toContain("default_timezone=");
      // Every redirected entry is tagged so compare can credit the port wherever
      // it lands in the package.
      for (const m of base.classMethods.filter((m) => m.name.startsWith("writing_role"))) {
        expect(m.umbrellaConfig).toBe(true);
      }
      // The umbrella's `def self.` helpers are NOT harvested (not Base statics).
      expect(names).not.toContain("eager_load!");
    });

    it("redirects the `class << self; attr_accessor` block form to Base too", () => {
      // active_record.rb uses the `singleton_class.attr_*` command form today, but
      // the equivalent `class << self` block form is also module-level config and
      // must redirect to Base rather than being silently dropped.
      const out = scanWithUmbrella(
        BASE_SRC,
        `
      module ActiveRecord
        class << self
          attr_accessor :writing_role
        end
      end
    `,
      );
      const base = out["ActiveRecord::Base"];
      const names = base.classMethods.map((m) => m.name);
      expect(names).toContain("writing_role");
      expect(names).toContain("writing_role=");
      for (const m of base.classMethods.filter((m) => m.name.startsWith("writing_role"))) {
        expect(m.umbrellaConfig).toBe(true);
      }
    });

    it("does not leak umbrella config onto the ActiveRecord module's bucket", () => {
      const out = scanWithUmbrella(
        BASE_SRC,
        `
      module ActiveRecord
        singleton_class.attr_accessor :writing_role
      end
    `,
      );
      const mod = out["ActiveRecord"];
      const modNames = mod ? mod.classMethods.map((m) => m.name) : [];
      expect(modNames).not.toContain("writing_role");
    });

    it("skips umbrella config when the module has no ::Base to redirect to", () => {
      // `ActiveSupport.error_reporter` lives on a module with no `::Base`; without
      // a Base to credit it, recording it would leak onto the module's entity-file
      // bucket as false-missing, so it must be skipped entirely.
      const out = scanWithUmbrella(
        `
      module ActiveSupport
        class NotBase
          def call; end
        end
      end
    `,
        `
      module ActiveSupport
        singleton_class.attr_accessor :error_reporter
      end
    `,
      );
      const mod = out["ActiveSupport"];
      const names = mod ? [...mod.classMethods, ...mod.instanceMethods].map((m) => m.name) : [];
      expect(names).not.toContain("error_reporter");
    });

    // `vendor/i18n/lib/i18n.rb` is not an autoload manifest: it is where
    // `I18n::Base`, the gem's whole public facade, is defined. The config-only
    // scan above sees only its three aliases, so the ported facade is measured
    // against a denominator of 3. UMBRELLA_FULL_SCAN_PACKAGES opts such a package
    // into a full walk.
    it("extracts the method definitions of an umbrella file scanned in full", () => {
      const out = scanWithUmbrella(
        BASE_SRC,
        `
      module ActiveRecord
        module Facade
          def translate(key, **options); end
          alias :t :translate

          private

          def translate_key(key); end
        end

        def self.reserve_key(key); end

        extend Facade
      end
    `,
        true,
      );
      const facade = out["ActiveRecord::Facade"];
      expect(facade.instanceMethods.map((m) => m.name)).toEqual([
        "translate",
        "t",
        "translate_key",
      ]);
      expect(facade.instanceMethods.map((m) => m.visibility)).toEqual([
        "public",
        "public",
        "private",
      ]);
      expect(facade.file).toBe("../active_record.rb");
      expect(out["ActiveRecord"].classMethods.map((m) => m.name)).toContain("reserve_key");
    });

    it("keeps a config-only umbrella scan free of those definitions", () => {
      const out = scanWithUmbrella(
        BASE_SRC,
        `
      module ActiveRecord
        module Facade
          def translate(key, **options); end
        end

        def self.reserve_key(key); end
      end
    `,
      );
      expect(out["ActiveRecord::Facade"].instanceMethods).toEqual([]);
      expect(out["ActiveRecord"].classMethods).toEqual([]);
    });
  },
);

describe(
  "Ruby extractor body digest (source-hash pinning)",
  { timeout: RUBY_SUBPROCESS_TIMEOUT_MS },
  () => {
    const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

    // Returns a map of "<fqn>#<method>" -> bodyDigest for the given fixtures.
    function rubyDigests(fixtures: Record<string, string>): Record<string, string | undefined> {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digest-rb-"));
      try {
        for (const [rel, src] of Object.entries(fixtures)) {
          const p = path.join(dir, rel);
          fs.mkdirSync(path.dirname(p), { recursive: true });
          fs.writeFileSync(p, src);
        }
        const rels = JSON.stringify(Object.keys(fixtures));
        const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        ex = ApiExtractor.new
        JSON.parse(${JSON.stringify(rels)}).each do |rel|
          ex.process_file(File.join(${JSON.stringify(dir)}, rel), ${JSON.stringify(dir)})
        end
        out = {}
        ex.classes.each do |fqn, info|
          (info[:instanceMethods] + info[:classMethods]).each do |m|
            out["#{fqn}##{m[:name]}"] = m[:bodyDigest]
          end
        end
        puts JSON.generate(out)
      `;
        const stdout = execFileSync("ruby", ["-e", driver], { encoding: "utf-8" });
        return JSON.parse(stdout);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    it("emits a body digest for each method", () => {
      const d = rubyDigests({
        "foo.rb": `
        class Foo
          def save
            run_callbacks(:save)
          end
        end
      `,
      });
      expect(d["Foo#save"]).toMatch(/^[0-9a-f]{16}$/);
    });

    it("is unchanged by indentation, blank-line, and comment churn", () => {
      const base = rubyDigests({
        "a.rb": `
        class Foo
          def save
            validate!
            run_callbacks(:save)
          end
        end
      `,
      });
      const churned = rubyDigests({
        "a.rb": `
        class Foo
          def save
                # a leading comment
                validate!


                run_callbacks(:save) # trailing comment
          end
        end
      `,
      });
      expect(churned["Foo#save"]).toBe(base["Foo#save"]);
    });

    it("changes when the body's code changes (drift)", () => {
      const base = rubyDigests({
        "a.rb": `
        class Foo
          def save
            run_callbacks(:save)
          end
        end
      `,
      });
      const edited = rubyDigests({
        "a.rb": `
        class Foo
          def save
            run_callbacks(:create)
          end
        end
      `,
      });
      expect(edited["Foo#save"]).not.toBe(base["Foo#save"]);
    });
  },
);

// Per-method source lines let consumers (the file-structure method-order
// manifest) interleave classMethods back into Rails source order instead of
// appending them after instanceMethods — which inverts every Rails file that
// opens with a `class << self` block (active_model/attribute.rb:7-24).
describe("Ruby extractor method source lines", { timeout: RUBY_SUBPROCESS_TIMEOUT_MS }, () => {
  const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

  // Returns "<fqn>#<method>" -> [bucket, line].
  function rubyLines(src: string): Record<string, [string, number]> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lines-rb-"));
    try {
      fs.writeFileSync(path.join(dir, "a.rb"), src);
      const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        ex = ApiExtractor.new
        ex.process_file(File.join(${JSON.stringify(dir)}, "a.rb"), ${JSON.stringify(dir)})
        out = {}
        ex.classes.each do |fqn, info|
          %i[instanceMethods classMethods].each do |bucket|
            info[bucket].each { |m| out["#{fqn}##{m[:name]}"] = [bucket.to_s, m[:line]] }
          end
        end
        puts JSON.generate(out)
      `;
      return JSON.parse(execFileSync("ruby", ["-e", driver], { encoding: "utf-8" }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("records a leading `class << self` block ahead of the instance methods", () => {
    const lines = rubyLines(
      [
        "class Attribute",
        "  class << self",
        "    def from_database(value)",
        "      new(value)",
        "    end",
        "  end",
        "",
        "  attr_reader :value",
        "",
        "  def initialize(value)",
        "    @value = value",
        "  end",
        "end",
      ].join("\n"),
    );
    expect(lines["Attribute#from_database"]).toEqual(["classMethods", 3]);
    expect(lines["Attribute#value"]).toEqual(["instanceMethods", 8]);
    expect(lines["Attribute#initialize"]).toEqual(["instanceMethods", 10]);
  });

  it("records a line for `def self.` singleton methods and aliases", () => {
    const lines = rubyLines(
      [
        "class Foo",
        "  def bar",
        "  end",
        "",
        "  alias baz bar",
        "",
        "  def self.qux",
        "  end",
        "end",
      ].join("\n"),
    );
    expect(lines["Foo#bar"]).toEqual(["instanceMethods", 2]);
    expect(lines["Foo#baz"]).toEqual(["instanceMethods", 5]);
    expect(lines["Foo#qux"]).toEqual(["classMethods", 7]);
  });
});

describe(
  "Ruby extractor option-key const expansion",
  { timeout: RUBY_SUBPROCESS_TIMEOUT_MS },
  () => {
    const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

    // Returns a map of "<fqn>#<method>" -> the method's expanded option_keys.
    function optionKeys(fixtures: Record<string, string>): Record<string, string[] | undefined> {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "optkeys-rb-"));
      try {
        for (const [rel, src] of Object.entries(fixtures)) {
          const p = path.join(dir, rel);
          fs.mkdirSync(path.dirname(p), { recursive: true });
          fs.writeFileSync(p, src);
        }
        const rels = JSON.stringify(Object.keys(fixtures));
        const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        ex = ApiExtractor.new
        JSON.parse(${JSON.stringify(rels)}).each do |rel|
          ex.process_file(File.join(${JSON.stringify(dir)}, rel), ${JSON.stringify(dir)})
        end
        out = {}
        (ex.classes.to_a + ex.modules.to_a).each do |fqn, info|
          (info[:instanceMethods] + info[:classMethods]).each do |m|
            out["#{fqn}##{m[:name]}"] = m[:option_keys]
          end
        end
        puts JSON.generate(out)
      `;
        const stdout = execFileSync("ruby", ["-e", driver], { encoding: "utf-8" });
        return JSON.parse(stdout);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    it("binds a leading :: option-key const to the top level, not a nested const", () => {
      const r = optionKeys({
        "abs_opt.rb": `
        module Foo
          KEYS = [:top_a, :top_b]
        end

        module Bar
          module Foo
            KEYS = [:nested_a, :nested_b]
          end

          class Rel
            def build(options = {})
              options.assert_valid_keys(::Foo::KEYS)
            end
          end
        end
      `,
      });
      expect(r["Bar::Rel#build"]).toEqual(["top_a", "top_b"]);
    });
  },
);

describe("Ruby extractor file constants", { timeout: RUBY_SUBPROCESS_TIMEOUT_MS }, () => {
  const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

  function rubyFileConstants(src: string): Record<string, { kind: string }> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "consts-rb-"));
    try {
      fs.writeFileSync(path.join(dir, "adapter.rb"), src);
      const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        ex = ApiExtractor.new
        ex.process_file(File.join(${JSON.stringify(dir)}, "adapter.rb"), ${JSON.stringify(dir)})
        puts JSON.generate(ex.file_constants["adapter.rb"] || {})
      `;
      return JSON.parse(execFileSync("ruby", ["-e", driver], { encoding: "utf-8" }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("records non-literal constants as expr so the name index is complete", () => {
    const c = rubyFileConstants(`
      class Adapter
        ER_DUP_ENTRY = 1062
        NATIVE_DATABASE_TYPES = { primary_key: "bigserial primary key" }
        VALID_OPTIONS = [:class_name, :foreign_key].freeze
      end
    `);
    expect(c["ER_DUP_ENTRY"]).toEqual({ kind: "int", value: "1062" });
    // Names extra-surface scoring needs; the literal diff skips "expr" values.
    expect(c["NATIVE_DATABASE_TYPES"]).toEqual({ kind: "expr" });
    expect(c["VALID_OPTIONS"]).toEqual({ kind: "expr" });
  });
});

describe(
  "Ruby extractor metaprogrammed method surface",
  { timeout: RUBY_SUBPROCESS_TIMEOUT_MS },
  () => {
    const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

    type MetaMethod = {
      name: string;
      notes?: string;
      visibility: string;
      params: { kind: string }[];
    };

    // Returns "<fqn>" -> instance methods, so a test can assert both the
    // generated names and the params lifted off the define_method block.
    function metaMethods(src: string): Record<string, MetaMethod[]> {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meta-rb-"));
      try {
        fs.writeFileSync(path.join(dir, "meta.rb"), src);
        const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        ex = ApiExtractor.new
        ex.process_file(File.join(${JSON.stringify(dir)}, "meta.rb"), ${JSON.stringify(dir)})
        ex.dedupe_define_methods!
        out = {}
        (ex.classes.to_a + ex.modules.to_a).each do |fqn, info|
          out[fqn] = info[:instanceMethods]
          out["#{fqn}.self"] = info[:classMethods]
        end
        puts JSON.generate(out)
      `;
        return JSON.parse(execFileSync("ruby", ["-e", driver], { encoding: "utf-8" }));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    it("records define_method with a literal name", () => {
      const m = metaMethods(`
      module Engine
        define_method(:railtie_routes_url_helpers) { |include_path_helpers = true| nil }
        define_method "railtie_helpers_paths" do
          nil
        end
      end
    `);
      const names = m["Engine"].map((x) => x.name);
      expect(names).toContain("railtie_routes_url_helpers");
      expect(names).toContain("railtie_helpers_paths");
      const urlHelpers = m["Engine"].find((x) => x.name === "railtie_routes_url_helpers")!;
      expect(urlHelpers.notes).toBe("define_method");
      // The block's params are the generated method's params.
      expect(urlHelpers.params.map((p) => p.kind)).toEqual(["optional"]);
    });

    it("synthesizes the accessors and initialize a Struct.new superclass generates", () => {
      const m = metaMethods(`
      module Arel
        class Attribute < Struct.new :relation, :name
          def type_caster
            relation.type_for_attribute(name)
          end
        end
      end
    `);
      expect(m["Arel::Attribute"].map((x) => x.name).sort()).toEqual([
        "initialize",
        "name",
        "name=",
        "relation",
        "relation=",
        "type_caster",
      ]);
      const init = m["Arel::Attribute"].find((x) => x.name === "initialize")!;
      expect(init.params).toEqual([
        { name: "relation", kind: "optional", default: "..." },
        { name: "name", kind: "optional", default: "..." },
      ]);
      const reader = m["Arel::Attribute"].find((x) => x.name === "relation")!;
      expect(reader.params).toEqual([]);
    });

    it("synthesizes keyword params for a keyword_init Struct's initialize", () => {
      const m = metaMethods(`
      module ActiveSupport
        class Report < Struct.new(:error, :severity, keyword_init: true)
        end
      end
    `);
      const init = m["ActiveSupport::Report"].find((x) => x.name === "initialize")!;
      expect(init.params).toEqual([
        { name: "error", kind: "keyword", default: "..." },
        { name: "severity", kind: "keyword", default: "..." },
      ]);
    });

    it("synthesizes the accessors a `CONST = Struct.new(...) do ... end` generates", () => {
      const m = metaMethods(`
      module Arel
        Edge = Struct.new(:name, :from) do
          def to_s
            name
          end
        end
      end
    `);
      expect(m["Arel::Edge"].map((x) => x.name).sort()).toEqual([
        "from",
        "from=",
        "initialize",
        "name",
        "name=",
        "to_s",
      ]);
    });

    it("unrolls a literal-array each loop that interpolates the loop variable", () => {
      const m = metaMethods(`
      module ClassMethods
        [:before, :after, :around].each do |callback|
          define_method "#{callback}_action" do |*names, &blk|
            nil
          end

          define_method "skip_#{callback}_action" do |*names|
            nil
          end

          alias_method :"append_#{callback}_action", :"#{callback}_action"
        end
      end
    `);
      const names = m["ClassMethods"].map((x) => x.name);
      expect(names).toEqual([
        "before_action",
        "after_action",
        "around_action",
        "skip_before_action",
        "skip_after_action",
        "skip_around_action",
        "append_before_action",
        "append_after_action",
        "append_around_action",
      ]);
      const beforeAction = m["ClassMethods"].find((x) => x.name === "before_action")!;
      expect(beforeAction.params.map((p) => p.kind)).toEqual(["rest", "block"]);
      const appendBefore = m["ClassMethods"].find((x) => x.name === "append_before_action")!;
      expect(appendBefore.notes).toBe("alias");
    });

    it("records both block-less define_method shapes exactly once", () => {
      // Bare command (action_view/layouts.rb:311's shape) and parenthesized
      // (rack/utils.rb:183's). The block forms below must not be recorded twice
      // by the generic descent re-reaching process_command / method_add_arg.
      const m = metaMethods(`
      module Shapes
        define_method :from_proc, &_layout
        define_method(:from_method, Kernel.instance_method(:inspect))
        define_method :with_do_block do |a|
          nil
        end
        define_method(:with_brace_block) { |a| nil }
      end
    `);
      expect(m["Shapes"].map((x) => x.name)).toEqual([
        "from_proc",
        "from_method",
        "with_do_block",
        "with_brace_block",
      ]);
      // Only the block forms can supply params; the block-less ones stay empty.
      expect(m["Shapes"].map((x) => x.params.length)).toEqual([0, 0, 1, 1]);
    });

    it("buckets a `class << self` define_method as a class method", () => {
      const m = metaMethods(`
      class Base
        class << self
          define_method(:configure) { nil }
        end

        private

        define_method(:normalize) { nil }
      end
    `);
      expect(m["Base.self"].map((x) => x.name)).toEqual(["configure"]);
      const normalize = m["Base"].find((x) => x.name === "normalize")!;
      expect(normalize.visibility).toBe("private");
    });

    it("keeps the literal def when a branch defines the same name both ways", () => {
      // rack utils.rb:183 — `define_method(:escape_html, …)` or `def escape_html`
      // off an `if defined?(…)`; the extractor walks both branches, only one is live.
      const m = metaMethods(`
      module Utils
        if defined?(ERB::Escape)
          define_method(:escape_html, ERB::Escape.instance_method(:html_escape))
        else
          def escape_html(string)
            CGI.escapeHTML(string.to_s)
          end
        end
      end
    `);
      expect(m["Utils"].map((x) => [x.name, x.notes])).toEqual([["escape_html", undefined]]);
    });

    it("skips a define_method whose name cannot be resolved to literals", () => {
      const m = metaMethods(`
      module Unresolvable
        SUFFIXES.each do |suffix|
          define_method "reader_#{suffix}" do
            nil
          end
        end

        [:a, :b].each do |member|
          define_method "#{member}_#{prefix}" do
            nil
          end
        end

        column_names.each do |name|
          define_method(name) { nil }
        end
      end
    `);
      expect(m["Unresolvable"] ?? []).toEqual([]);
      expect(m["Unresolvable.self"] ?? []).toEqual([]);
    });
  },
);

describe("Ruby extractor call-argument capture", { timeout: RUBY_SUBPROCESS_TIMEOUT_MS }, () => {
  const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

  interface CallSite {
    name: string;
    args: string[];
    flags: string[];
  }

  // Returns a map of "<fqn>#<method>" -> the ordered callArgs stream.
  function rubyCallArgs(fixtures: Record<string, string>): Record<string, CallSite[] | undefined> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "call-args-rb-"));
    try {
      for (const [rel, src] of Object.entries(fixtures)) {
        const p = path.join(dir, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, src);
      }
      const rels = JSON.stringify(Object.keys(fixtures));
      const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        ex = ApiExtractor.new
        JSON.parse(${JSON.stringify(rels)}).each do |rel|
          ex.process_file(File.join(${JSON.stringify(dir)}, rel), ${JSON.stringify(dir)})
        end
        out = {}
        ex.classes.each do |fqn, info|
          (info[:instanceMethods] + info[:classMethods]).each do |m|
            out["#{fqn}##{m[:name]}"] = m[:callArgs]
          end
        end
        puts JSON.generate(out)
      `;
      const stdout = execFileSync("ruby", ["-e", driver], { encoding: "utf-8" });
      return JSON.parse(stdout);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // The arguments of the one site named `name`, or undefined if there is none.
  function argsOf(sites: CallSite[] | undefined, name: string): string[] | undefined {
    return sites?.find((s) => s.name === name)?.args;
  }

  it("emits a descriptor for every extractable argument form", () => {
    const c = rubyCallArgs({
      "foo.rb": `
        class Foo
          def m(param)
            visit(param, @collector, count, 1, 2.5, "sql", true, false, nil, :dump, Nodes::Grouping)
          end
        end
      `,
    });
    expect(argsOf(c["Foo#m"], "visit")).toEqual([
      "id:param",
      "id:@collector",
      "id:count",
      "num:1",
      "num:2.5",
      "str:sql",
      "bool:true",
      "bool:false",
      "nil",
      "sym:dump",
      "const:Grouping",
    ]);
  });

  it("emits opaque descriptors the comparator has to skip", () => {
    const c = rubyCallArgs({
      "foo.rb": `
        class Foo
          def m(a, b)
            visit([1], { "k" => 1 }, "id #{a}", a + b, -a, a ? b : nil)
          end
        end
      `,
    });
    expect(argsOf(c["Foo#m"], "visit")).toEqual([
      "array",
      "hash",
      "str-interp",
      "binop:+",
      "unaryid:a",
      "ternary",
    ]);
  });

  it("records keyword arguments as keys plus value descriptors", () => {
    const c = rubyCallArgs({
      "foo.rb": `
        class Foo
          def m(object)
            assert_valid_value(object, action: :dump)
            build(scope: relation, on: "posts", limit: 1)
          end
        end
      `,
    });
    expect(argsOf(c["Foo#m"], "assert_valid_value")).toEqual([
      "id:object",
      "kwargs{action=sym:dump}",
    ]);
    expect(argsOf(c["Foo#m"], "build")).toEqual([
      "kwargs{scope=id:relation,on=str:posts,limit=num:1}",
    ]);
  });

  it("escapes a descriptor delimiter inside a string value", () => {
    const c = rubyCallArgs({
      "foo.rb": `
        class Foo
          def m(list, collector)
            inject_join(list, collector, ", ")
            to_sentence(last_word_connector: ", or ", sep: "a=b{c}d")
          end
        end
      `,
    });
    expect(argsOf(c["Foo#m"], "inject_join")).toEqual(["id:list", "id:collector", "str:%2C "]);
    expect(argsOf(c["Foo#m"], "to_sentence")).toEqual([
      "kwargs{last_word_connector=str:%2C or ,sep=str:a%3Db%7Bc%7Dd}",
    ]);
  });

  it("recurses into a nested keyword hash", () => {
    const c = rubyCallArgs({
      "foo.rb": `
        class Foo
          def m
            visit(a: { b: 1 }, c: { d: { e: :dump } })
          end
        end
      `,
    });
    expect(argsOf(c["Foo#m"], "visit")).toEqual([
      "kwargs{a=kwargs{b=num:1},c=kwargs{d=kwargs{e=sym:dump}}}",
    ]);
  });

  it("reads a braced hash with keyword-shaped keys as kwargs, and any other as opaque", () => {
    const c = rubyCallArgs({
      "foo.rb": `
        class Foo
          def m(x)
            visit({ a: 1 })
            visit(:b => 2)
            visit({})
            visit({ "c" => 3 })
            visit({ x => 4 })
          end
        end
      `,
    });
    const sites = (c["Foo#m"] ?? []).filter((s) => s.name === "visit");
    expect(sites.map((s) => s.args)).toEqual([
      ["kwargs{a=num:1}"],
      ["kwargs{b=num:2}"],
      ["hash"],
      ["hash"],
      ["hash"],
    ]);
  });

  it("records a nested call by name and Foo.new as a constructor", () => {
    const c = rubyCallArgs({
      "foo.rb": `
        class Foo
          def m(o)
            visit(o.relation, Nodes::Grouping.new(o))
          end
        end
      `,
    });
    expect(argsOf(c["Foo#m"], "visit")).toEqual(["call:relation", "call:constructor"]);
  });

  it("flags splat, double-splat, block-pass and block sites", () => {
    const c = rubyCallArgs({
      "foo.rb": `
        class Foo
          def m(args, opts, xs)
            build(*args)
            build(**opts)
            xs.map(&:to_s)
            xs.each { |x| save(x) }
          end
        end
      `,
    });
    const sites = c["Foo#m"] ?? [];
    expect(sites.find((s) => s.name === "build")).toEqual({
      name: "build",
      args: ["*splat"],
      flags: ["splat"],
    });
    expect(sites.filter((s) => s.name === "build")[1]).toEqual({
      name: "build",
      args: ["kwargs{**splat}"],
      flags: ["splat"],
    });
    // `xs` is a local, so both sites are also weak-receiver ones.
    expect(sites.find((s) => s.name === "map")?.flags).toEqual([
      "weak",
      "blockpass",
      "blockarg=sym:to_s",
    ]);
    expect(sites.find((s) => s.name === "each")?.flags).toEqual(["block", "weak"]);
    expect(argsOf(sites, "save")).toEqual(["id:x"]);
  });

  it("flags a site whose receiver is inert as weak, per site", () => {
    const c = rubyCallArgs({
      "foo.rb": `
        class Foo
          def m(node_class, o)
            node_class.new o.ast
            Nodes::Union.new o.ast
          end
        end
      `,
    });
    const sites = c["Foo#m"] ?? [];
    // Ruby resolves the same NAME two ways here: `new` on a local is inert, on
    // a constant it is a genuine call to a ported collaborator. The per-method
    // weak-NAME set cannot tell them apart; the per-site flag can.
    expect(sites.filter((s) => s.name === "new").map((s) => s.flags)).toEqual([["weak"], []]);
    expect(sites.filter((s) => s.name === "ast").every((s) => s.flags.includes("weak"))).toBe(true);
  });

  it("flags a Module metaprogramming site inside a module_eval block as weak", () => {
    const c = rubyCallArgs({
      "foo.rb": `
        class Foo
          def m(target_module, method_name)
            target_module.module_eval do
              define_method(method_name) { warn(method_name) }
            end
            define_method(method_name)
          end
        end
      `,
    });
    const sites = c["Foo#m"] ?? [];
    // Inside the block `self` is the module, so that `define_method` is Ruby
    // metaprogramming; the same name outside it, and the ported `warn`, are not.
    expect(sites.filter((s) => s.name === "define_method").map((s) => s.flags)).toEqual([
      ["block", "weak"],
      [],
    ]);
    expect(sites.find((s) => s.name === "warn")?.flags).toEqual([]);
  });

  it("records bare super as a zsuper site and super(args) with its arguments", () => {
    const c = rubyCallArgs({
      "foo.rb": `
        class Foo
          def m(a)
            super(a)
          end

          def n
            super
          end

          def o
            super do
              reset
            end
          end
        end
      `,
    });
    expect(argsOf(c["Foo#m"], "super")).toEqual(["id:a"]);
    expect(c["Foo#n"]).toEqual([{ name: "super", args: [], flags: ["zsuper"] }]);
    expect(c["Foo#o"]).toEqual([
      { name: "super", args: [], flags: ["block", "zsuper"] },
      { name: "reset", args: [], flags: [] },
    ]);
  });

  it("records each syntactic call site exactly once, receiver first", () => {
    const c = rubyCallArgs({
      "foo.rb": `
        class Foo
          def m
            foo(bar(1))
          end

          def n(x)
            o.visit x, collector
          end
        end
      `,
    });
    expect(c["Foo#m"]).toEqual([
      { name: "foo", args: ["call:bar"], flags: [] },
      { name: "bar", args: ["num:1"], flags: [] },
    ]);
    expect((c["Foo#n"] ?? []).map((s) => s.name)).toEqual(["o", "visit", "collector"]);
    expect(argsOf(c["Foo#n"], "visit")).toEqual(["id:x", "id:collector"]);
  });

  it("keeps a zero-argument call site in the stream", () => {
    const c = rubyCallArgs({
      "foo.rb": `
        class Foo
          def m
            reset
            reset
          end
        end
      `,
    });
    expect(c["Foo#m"]).toEqual([
      { name: "reset", args: [], flags: [] },
      { name: "reset", args: [], flags: [] },
    ]);
  });
});

describe("Ruby extractor attr_reader flag", { timeout: RUBY_SUBPROCESS_TIMEOUT_MS }, () => {
  const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

  type AttrMethod = { name: string; reader?: boolean };

  // Returns "<fqn>" -> instance methods, so a test can assert which entries the
  // extractor generated from an `attr_*` declaration.
  function attrMethods(src: string): Record<string, AttrMethod[]> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attr-rb-"));
    try {
      fs.writeFileSync(path.join(dir, "attr.rb"), src);
      const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        ex = ApiExtractor.new
        ex.process_file(File.join(${JSON.stringify(dir)}, "attr.rb"), ${JSON.stringify(dir)})
        out = {}
        ex.classes.each { |fqn, info| out[fqn] = info[:instanceMethods] }
        puts JSON.generate(out)
      `;
      return JSON.parse(execFileSync("ruby", ["-e", driver], { encoding: "utf-8" }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // The flag is what tells compare.ts's checkCallArgs that `if foreign_key`
  // (schema_definitions.rb:241) is a FIELD read in the port, so it must not be
  // paired against the body's real `table.foreign_key(...)` call at :242.
  it("flags attr_reader and attr_accessor readers, not the writer or a def", () => {
    const m = attrMethods(`
      class ReferenceDefinition
        attr_accessor :name
        attr_reader(:foreign_key)

        def add_to(table)
          table.foreign_key(foreign_table_name) if foreign_key
        end
      end
    `);
    const byName = new Map(m["ReferenceDefinition"].map((x) => [x.name, x]));
    expect(byName.get("foreign_key")?.reader).toBe(true);
    expect(byName.get("name")?.reader).toBe(true);
    expect(byName.get("name=")?.reader).toBeUndefined();
    expect(byName.get("add_to")?.reader).toBeUndefined();
  });
});

describe(
  "Ruby extractor attr_reader read suppression",
  { timeout: RUBY_SUBPROCESS_TIMEOUT_MS },
  () => {
    const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

    // Returns a map of "<fqn>#<method>" -> [callArgs site names, calls].
    function rubyStreams(
      fixtures: Record<string, string>,
    ): Record<string, { sites: string[]; calls: string[] }> {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attr-rb-"));
      try {
        for (const [rel, src] of Object.entries(fixtures)) {
          const p = path.join(dir, rel);
          fs.mkdirSync(path.dirname(p), { recursive: true });
          fs.writeFileSync(p, src);
        }
        const rels = JSON.stringify(Object.keys(fixtures));
        const driver = `
        require_relative ${JSON.stringify(RUBY_SCRIPT)}
        require "json"
        ex = ApiExtractor.new
        JSON.parse(${JSON.stringify(rels)}).each do |rel|
          ex.process_file(File.join(${JSON.stringify(dir)}, rel), ${JSON.stringify(dir)})
        end
        out = {}
        ex.classes.each do |fqn, info|
          (info[:instanceMethods] + info[:classMethods]).each do |m|
            out["#{fqn}##{m[:name]}"] = {
              sites: (m[:callArgs] || []).map { |s| s[:name] },
              calls: m[:calls] || [],
            }
          end
        end
        puts JSON.generate(out)
      `;
        const stdout = execFileSync("ruby", ["-e", driver], { encoding: "utf-8" });
        return JSON.parse(stdout);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    it("drops a bare read of an attr_reader, which the port spells as a getter", () => {
      const c = rubyStreams({
        "scope.rb": `
        class Scope
          private
            attr_reader :value_transformation

            def transform_value(value)
              value_transformation.call(value)
            end

            def transform_self(value)
              self.value_transformation.call(value)
            end
        end
      `,
      });
      // The reader read itself is gone, and the Proc invocation Ruby spells
      // `.call` on it lands under the reader's name — what `this.valueTransformation(value)`
      // records on the TS side.
      expect(c["Scope#transform_value"].sites).toEqual(["value_transformation"]);
      expect(c["Scope#transform_self"].sites).toEqual(["value_transformation"]);
      expect(c["Scope#transform_value"].calls).toEqual(["value_transformation"]);
    });

    it("keeps a site that passes arguments to an attr_reader name", () => {
      const c = rubyStreams({
        "branch.rb": `
        class Branch
          attr_reader :association

          def preloaders_for_reflection(record)
            record.class._reflect_on_association(association)
            record.association(association)
          end
        end
      `,
      });
      expect(c["Branch#preloaders_for_reflection"].sites).toEqual(["class", "association"]);
    });

    it("keeps a bare call whose name is an attr_reader on a NESTED class only", () => {
      const c = rubyStreams({
        "outer.rb": `
        class Outer
          def read
            association
          end

          class Inner
            attr_reader :association
          end
        end
      `,
      });
      expect(c["Outer#read"].sites).toEqual(["association"]);
    });
  },
);
