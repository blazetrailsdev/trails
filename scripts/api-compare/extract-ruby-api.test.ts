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
describe("Ruby extractor body call capture", () => {
  const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

  // Returns a map of "<fqn>#<method>" -> calls array for the given fixtures.
  function rubyCalls(fixtures: Record<string, string>): Record<string, string[] | undefined> {
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
            out["#{fqn}##{m[:name]}"] = m[:calls]
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

describe("Ruby extractor alias arity resolution", () => {
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
});

describe("Ruby extractor umbrella module-config scanning", () => {
  const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

  // Lay out a package libPath with a `base.rb` and a sibling umbrella file
  // one level above it, scan the package then the umbrella, and return the
  // ActiveRecord::Base / ActiveRecord entries.
  function scanWithUmbrella(baseSrc: string, umbrellaSrc: string): Record<string, ClassEntry> {
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
        ex.scan_umbrella_file(File.join(${JSON.stringify(root)}, "active_record.rb"), ${JSON.stringify(libPath)})
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
    instanceMethods: { name: string }[];
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
});

describe("Ruby extractor body digest (source-hash pinning)", () => {
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
});

// Per-method source lines let consumers (the file-structure method-order
// manifest) interleave classMethods back into Rails source order instead of
// appending them after instanceMethods — which inverts every Rails file that
// opens with a `class << self` block (active_model/attribute.rb:7-24).
describe("Ruby extractor method source lines", () => {
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

describe("Ruby extractor option-key const expansion", () => {
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
});

describe("Ruby extractor file constants", () => {
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

describe("Ruby extractor metaprogrammed method surface", () => {
  const RUBY_SCRIPT = path.join(HERE, "extract-ruby-api.rb");

  type MetaMethod = { name: string; notes?: string; params: { kind: string }[] };

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
        out = {}
        (ex.classes.to_a + ex.modules.to_a).each do |fqn, info|
          out[fqn] = info[:instanceMethods]
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
  });
});
