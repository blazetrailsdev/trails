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
  ): Record<string, { params: string[]; notes?: string; hasAliasTarget: boolean }> {
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

  it("leaves an alias to an out-of-package target empty (best effort)", () => {
    const r = aliasParams({
      "u.rb": `
        class Lonely
          alias :gone :inherited_from_elsewhere
        end
      `,
    });
    expect(r["Lonely#gone"]).toMatchObject({ params: [], notes: "alias" });
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
