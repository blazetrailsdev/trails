import { describe, it, expect, vi, afterEach } from "vitest";
import * as path from "path";
import * as ts from "typescript";
import type { ApiManifest, ClassInfo, MethodInfo, PackageInfo } from "./types.js";
import {
  buildGlobalRubyCandidates,
  buildReport,
  parseArgs,
  collectTsFileNames,
  collectTaggedEntries,
} from "./extra-surface.js";
import { extractFromProgram } from "./extract-ts-api.js";

function method(name: string, internal = false): MethodInfo {
  return { name, visibility: internal ? "private" : "public", params: [], internal };
}

function rubyClass(opts: {
  name: string;
  file: string;
  instance?: MethodInfo[];
  klass?: MethodInfo[];
  includes?: string[];
}): ClassInfo {
  return {
    name: opts.name,
    file: opts.file,
    includes: opts.includes ?? [],
    extends: [],
    instanceMethods: opts.instance ?? [],
    classMethods: opts.klass ?? [],
  };
}

describe("parseArgs", () => {
  it("defaults topN=50, maxDetail=40, no novelOnly", () => {
    const a = parseArgs([]);
    expect(a).toEqual({
      filterPkg: null,
      topN: 50,
      json: false,
      excludeGlobs: [],
      novelOnly: false,
      maxDetail: 40,
    });
  });

  it("parses all flags", () => {
    const a = parseArgs([
      "--package",
      "activerecord",
      "--top",
      "10",
      "--json",
      "--novel-only",
      "--max-detail",
      "0",
      "--exclude-glob",
      "dx-tests/",
      "--exclude-glob",
      "barrel.ts",
    ]);
    expect(a.filterPkg).toBe("activerecord");
    expect(a.topN).toBe(10);
    expect(a.json).toBe(true);
    expect(a.novelOnly).toBe(true);
    expect(a.maxDetail).toBe(0);
    expect(a.excludeGlobs).toEqual(["dx-tests/", "barrel.ts"]);
  });
});

describe("buildGlobalRubyCandidates", () => {
  it("unions Ruby method TS-candidates across all packages, including internal", () => {
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activemodel: {
          classes: {
            "ActiveModel::Foo": rubyClass({
              name: "Foo",
              file: "foo.rb",
              instance: [method("public_one"), method("private_one", true)],
            }),
          },
          modules: {},
        },
        activerecord: {
          classes: {},
          modules: {
            "ActiveRecord::Mod": rubyClass({
              name: "Mod",
              file: "mod.rb",
              instance: [method("save_bang!")],
            }),
          },
        },
      },
    };
    const set = buildGlobalRubyCandidates(ruby);
    expect(set.has("publicOne")).toBe(true);
    expect(set.has("saveBangBang")).toBe(true);
    // Private Ruby methods are included: a TS public method mirroring one is a
    // visibility divergence (the method exists in Rails), not novel surface.
    expect(set.has("privateOne")).toBe(true);
  });

  it("includes file-level constant names verbatim so a relocated constant is moved, not novel", () => {
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {},
          modules: {},
          fileConstants: {
            "connection_adapters/abstract_mysql_adapter.rb": {
              ER_DUP_ENTRY: { kind: "int", value: "1062" },
            },
          },
        },
      },
    };
    const set = buildGlobalRubyCandidates(ruby);
    expect(set.has("ER_DUP_ENTRY")).toBe(true);
    expect(set.has("erDupEntry")).toBe(true);
  });

  it("does not camelize a single-token constant into a bare method-like name", () => {
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {},
          modules: {},
          fileConstants: {
            "connection_adapters/abstract_adapter.rb": { Version: { kind: "expr" } },
            // arel.rb:29 — SCREAMING, but single-token, so it camelizes to the
            // same bare `version` a CamelCase constant would.
            "arel.rb": { VERSION: { kind: "string", value: "10.0.0" } },
          },
        },
      },
    };
    const set = buildGlobalRubyCandidates(ruby);
    expect(set.has("Version")).toBe(true);
    expect(set.has("VERSION")).toBe(true);
    // `version` would absolve any novel TS method of that name, everywhere.
    expect(set.has("version")).toBe(false);
  });
});

describe("buildReport — novel vs moved classification", () => {
  function makeManifests(): { ruby: ApiManifest; ts: ApiManifest } {
    // Rails: foo.rb defines `bar`; baz.rb defines `quux`.
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activemodel: {
          classes: {
            "ActiveModel::Foo": rubyClass({
              name: "Foo",
              file: "foo.rb",
              instance: [method("bar")],
            }),
            "ActiveModel::Baz": rubyClass({
              name: "Baz",
              file: "baz.rb",
              instance: [method("quux")],
            }),
          },
          modules: {},
        },
      },
    };
    // TS: foo.ts defines `bar` (matched), `quux` (moved from baz.rb),
    //     and `tsOnlyHelper` (novel — nowhere in Rails).
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activemodel: {
          classes: {
            Foo: {
              name: "Foo",
              file: "foo.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("bar"), method("quux"), method("tsOnlyHelper")],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };
    return { ruby, ts };
  }

  it("classifies extras as novel when no Rails method maps to the name, moved otherwise", () => {
    const { ruby, ts } = makeManifests();
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    expect(report.packages).toHaveLength(1);
    const pkg = report.packages[0];
    expect(pkg.totalNovel).toBe(1);
    expect(pkg.totalMoved).toBe(1);
    expect(pkg.extraFiles).toHaveLength(1);
    const f = pkg.extraFiles[0];
    expect(f.tsFile).toBe("foo.ts");
    expect(f.extras.map((e) => [e.name, e.kind])).toEqual([
      ["tsOnlyHelper", "novel"],
      ["quux", "moved"],
    ]);
  });

  it("--novel-only drops moved extras from output and totals", () => {
    const { ruby, ts } = makeManifests();
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: true,
      topN: 50,
    });
    const pkg = report.packages[0];
    expect(pkg.totalNovel).toBe(1);
    expect(pkg.totalMoved).toBe(0);
    expect(pkg.extraFiles[0].extras.map((e) => e.name)).toEqual(["tsOnlyHelper"]);
  });

  it("allows a constant declared in the matched Ruby file, moves one from another file", () => {
    const { ruby, ts } = makeManifests();
    ruby.packages["activemodel"].fileConstants = {
      "foo.rb": { ER_DUP_ENTRY: { kind: "int", value: "1062" } },
      "baz.rb": { SHARED_MESSAGE: { kind: "string", value: "boom" } },
    };
    // A ported constant surfaces on the TS side as a static class member.
    ts.packages["activemodel"].classes["Foo"].classMethods = [
      method("ER_DUP_ENTRY"),
      method("SHARED_MESSAGE"),
      method("TS_ONLY_CONST"),
    ];
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    const f = report.packages[0].extraFiles[0];
    expect(f.extras.map((e) => [e.name, e.kind])).toEqual([
      ["TS_ONLY_CONST", "novel"],
      ["tsOnlyHelper", "novel"],
      ["quux", "moved"],
      ["SHARED_MESSAGE", "moved"],
    ]);
  });

  it("a Ruby class nested in the matched file contributes its constant and methods to the allow-set", () => {
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activemodel: {
          classes: {
            "ActiveModel::Outer": rubyClass({
              name: "Outer",
              file: "outer.rb",
              instance: [method("bar")],
            }),
            "ActiveModel::Outer::Inner": rubyClass({
              name: "Inner",
              file: "outer.rb",
              instance: [method("inner_only")],
            }),
          },
          modules: {},
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activemodel: {
          classes: {
            Outer: {
              name: "Outer",
              file: "outer.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("bar"), method("tsOnlyHelper")],
              classMethods: [method("Inner")],
            },
            Inner: {
              name: "Inner",
              file: "outer.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("innerOnly")],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    const pkg = report.packages[0];
    expect(pkg.extraFiles).toHaveLength(1);
    expect(pkg.extraFiles[0].extras.map((e) => e.name)).toEqual(["tsOnlyHelper"]);
  });

  it("a TS public method mirroring a Rails-PRIVATE method is not extra surface", () => {
    // Rails foo.rb has private `same_file_secret`; baz.rb has private
    // `other_file_secret`. TS foo.ts exposes both publicly plus a true novel.
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activemodel: {
          classes: {
            "ActiveModel::Foo": rubyClass({
              name: "Foo",
              file: "foo.rb",
              instance: [method("bar"), method("same_file_secret", true)],
            }),
            "ActiveModel::Baz": rubyClass({
              name: "Baz",
              file: "baz.rb",
              instance: [method("other_file_secret", true)],
            }),
          },
          modules: {},
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activemodel: {
          classes: {
            Foo: {
              name: "Foo",
              file: "foo.ts",
              includes: [],
              extends: [],
              instanceMethods: [
                method("bar"),
                method("sameFileSecret"),
                method("otherFileSecret"),
                method("trulyNovel"),
              ],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    const pkg = report.packages[0];
    // sameFileSecret: matched file's private method → allowed, not extra at all.
    // otherFileSecret: private method elsewhere in Rails → moved, not novel.
    // trulyNovel: nowhere in Rails → novel.
    expect(pkg.extraFiles[0].extras.map((e) => [e.name, e.kind])).toEqual([
      ["trulyNovel", "novel"],
      ["otherFileSecret", "moved"],
    ]);
    expect(pkg.totalNovel).toBe(1);
    expect(pkg.totalMoved).toBe(1);
  });

  it("doesn't flag predicate-Q, column-DSL, value-method, or SKIP-mirror names as novel", () => {
    // Rails foo.rb defines a `?` predicate; the column-type DSL
    // (`define_column_methods`) and Relation value-method accessors
    // (`VALUE_METHODS.each`) are now modeled by the Ruby extractor, so they
    // appear in the manifest like ordinary methods. A TS method mirroring a
    // `conventions.SKIP` method the SAME Ruby file defines (`freeze`, `to_a`)
    // is the faithful port, not drift — but a JS-only protocol name
    // (`catch`) has no Ruby counterpart and stays flagged.
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {
            "ActiveRecord::Foo": rubyClass({
              name: "Foo",
              file: "foo.rb",
              instance: [
                method("connected_to?"),
                method("bar"),
                method("integer"), // define_column_methods macro
                method("limit_value"), // Relation::VALUE_METHODS accessor
                method("freeze"), // conventions.SKIP, but Rails defines it here
                method("to_a"), // conventions.SKIP, spelled `toArray` in TS
                method("=="), // operator — spelled `equals` in TS
                method("initialize_copy"), // copy hook — spelled `clone`/`dup` in TS
              ],
            }),
          },
          modules: {},
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {
            Foo: {
              name: "Foo",
              file: "foo.ts",
              includes: [],
              extends: [],
              instanceMethods: [
                method("bar"),
                method("connectedToQ"), // predicate `?` → Q suffix
                method("integer"), // define_column_methods macro (matched in-file)
                method("limitValue"), // Relation::VALUE_METHODS accessor (matched in-file)
                method("freeze"), // SKIP mirror — foo.rb defines `freeze`
                method("toArray"), // SKIP mirror — foo.rb defines `to_a`
                method("equals"), // SKIP mirror — foo.rb defines `==`
                method("clone"), // SKIP mirror — foo.rb defines `initialize_copy`
                method("catch"), // JS Promise protocol, no Ruby counterpart
                method("genuinelyNovel"),
              ],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    expect(report.packages[0].extraFiles[0].extras.map((e) => e.name)).toEqual([
      "catch",
      "genuinelyNovel",
    ]);
  });

  it("keeps flagging Ruby-hook names — a TS `inherited` is drift, not a mirror", () => {
    // `inherited` is on a SKIP group marked `tsMirrorIsDrift`: Ruby module
    // hooks have no TS equivalent, so a same-named TS method is a trails
    // invention even though validations.rb really does `def self.inherited`.
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {
            "ActiveRecord::Foo": rubyClass({
              name: "Foo",
              file: "foo.rb",
              instance: [method("inherited"), method("freeze")],
            }),
          },
          modules: {},
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {
            Foo: {
              name: "Foo",
              file: "foo.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("inherited"), method("freeze")],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    expect(report.packages[0].extraFiles[0].extras.map((e) => e.name)).toEqual(["inherited"]);
  });

  it("skips _-prefixed and internal TS members, doesn't flag them as extras", () => {
    const { ruby } = makeManifests();
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activemodel: {
          classes: {
            Foo: {
              name: "Foo",
              file: "foo.ts",
              includes: [],
              extends: [],
              instanceMethods: [
                method("bar"),
                method("_railsPrivate"),
                method("internalThing", true),
              ],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    // baz.rb still maps to baz.ts which doesn't exist → no entry. foo.ts
    // has only `bar` (matched) plus filtered names → no drift entry at all.
    expect(report.packages[0].extraFiles).toHaveLength(0);
  });

  it("--exclude-glob skips matching TS file paths", () => {
    const { ruby, ts } = makeManifests();
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: ["foo.ts"],
      novelOnly: false,
      topN: 50,
    });
    expect(report.packages[0].extraFiles).toHaveLength(0);
  });

  it("resolves include names with namespace scope (no flat short-name pollution)", () => {
    // Two unrelated `Quoting` modules: AbstractAdapter::Quoting and
    // PostgreSQL::Quoting. AbstractAdapter `include "Quoting"` must resolve
    // ONLY to AbstractAdapter::Quoting; PG's `pgOnlyMethod` must NOT count
    // as allowed surface for abstract-adapter.ts.
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        ar: {
          classes: {
            "ConnectionAdapters::AbstractAdapter": {
              ...rubyClass({ name: "AbstractAdapter", file: "abstract_adapter.rb" }),
              includes: ["Quoting"],
            },
          },
          modules: {
            "ConnectionAdapters::Quoting": rubyClass({
              name: "Quoting",
              file: "abstract/quoting.rb",
              instance: [method("quote")],
            }),
            "ConnectionAdapters::PostgreSQL::Quoting": rubyClass({
              name: "Quoting",
              file: "postgresql/quoting.rb",
              instance: [method("pg_only_method")],
            }),
          },
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        ar: {
          classes: {
            AbstractAdapter: {
              name: "AbstractAdapter",
              file: "abstract-adapter.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("quote"), method("pgOnlyMethod")],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    const f = report.packages[0].extraFiles.find((x) => x.tsFile === "abstract-adapter.ts");
    // pgOnlyMethod must be flagged — namespace-scoped resolution prevents
    // PG's Quoting from contributing to AbstractAdapter's allowed set.
    expect(f).toBeDefined();
    expect(f!.extras.map((e) => e.name)).toContain("pgOnlyMethod");
  });

  it("a nested class sharing a file with a shorter-named parent is not its own counterpart file", () => {
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        ar: {
          classes: {
            "Preloader::Association": rubyClass({
              name: "Association",
              file: "preloader/association.rb",
              instance: [method("primary_method")],
            }),
            "Preloader::Association::LoaderQuery": rubyClass({
              name: "LoaderQuery",
              file: "preloader/association.rb",
              instance: [method("nested_helper")],
            }),
          },
          modules: {},
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        ar: {
          classes: {
            Association: {
              name: "Association",
              file: "preloader/association.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("primaryMethod"), method("nestedHelper")],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    expect(report.packages[0].extraFiles).toEqual([]);
  });

  it("admits scanned umbrella module config (Base class methods) over novel ports", () => {
    // `singleton_class.attr_accessor :writing_role` / `:reading_role` lives in
    // the umbrella file `lib/active_record.rb`, which sits above the extractor's
    // libPath. The extractor now scans it and attributes the config to
    // `ActiveRecord::Base` as class methods (see extract-ruby-api.rb
    // #scan_umbrella_file), so the `Base` static ports have a real Ruby
    // counterpart and aren't flagged novel — no curated allowlist needed.
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {
            "ActiveRecord::Base": rubyClass({
              name: "Base",
              file: "base.rb",
              instance: [method("save")],
              klass: [method("writing_role"), method("reading_role")],
            }),
          },
          modules: {},
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {
            Base: {
              name: "Base",
              file: "base.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("save")],
              classMethods: [method("writingRole"), method("readingRole"), method("trulyNovel")],
            },
          },
          modules: {},
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    const f = report.packages[0].extraFiles.find((x) => x.tsFile === "base.ts");
    expect(f).toBeDefined();
    // writingRole/readingRole credited from the scanned Base class methods;
    // only the genuinely-extra static is flagged.
    expect(f!.extras.map((e) => e.name)).toEqual(["trulyNovel"]);
  });

  it("folds ASC ::ClassMethods submodules into parent's classMethods", () => {
    // host `include Foo` — Rails runtime gives Host the methods on
    // Foo::ClassMethods. The fold puts ascHelper on Foo.classMethods so
    // it counts as Foo's own surface (compare.ts:759-773).
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        ar: {
          classes: {
            "P::Host": {
              ...rubyClass({ name: "Host", file: "host.rb" }),
              includes: ["Foo"],
            },
          },
          modules: {
            "P::Foo": rubyClass({ name: "Foo", file: "foo.rb" }),
            "P::Foo::ClassMethods": rubyClass({
              name: "ClassMethods",
              file: "foo.rb",
              instance: [method("asc_helper")],
            }),
          },
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        ar: {
          classes: {},
          modules: {
            Foo: {
              name: "Foo",
              file: "foo.ts",
              includes: [],
              extends: [],
              instanceMethods: [],
              // After fold, ascHelper is on Foo's own classMethods, so it
              // counts as Foo's matched surface (not extra).
              classMethods: [method("ascHelper")],
            },
          },
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    // foo.ts has only ascHelper, which matches (post-fold) → no drift entry.
    const fooDrift = report.packages[0].extraFiles.find((x) => x.tsFile === "foo.ts");
    expect(fooDrift).toBeUndefined();
  });

  it("does NOT propagate module classMethods through include (Ruby semantics)", () => {
    // Module Bar defines a class method `bareClassMethod` directly (not via
    // ASC's ClassMethods submodule). Host `include Bar` must NOT give Host
    // that name as allowed — Ruby's include only crosses instance methods.
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        ar: {
          classes: {
            "P::Host": {
              ...rubyClass({ name: "Host", file: "host.rb" }),
              includes: ["Bar"],
            },
          },
          modules: {
            "P::Bar": rubyClass({
              name: "Bar",
              file: "bar.rb",
              klass: [method("bare_class_method")],
            }),
          },
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        ar: {
          classes: {
            Host: {
              name: "Host",
              file: "host.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("bareClassMethod")],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    const f = report.packages[0].extraFiles.find((x) => x.tsFile === "host.ts");
    // bareClassMethod IS extra on host.ts — module class methods don't
    // propagate through include. (It will be classified `moved` because
    // it exists on Bar globally.)
    expect(f).toBeDefined();
    expect(f!.extras.map((e) => e.name)).toEqual(["bareClassMethod"]);
    expect(f!.extras[0].kind).toBe("moved");
  });

  it("resolves railtie-injected cross-package GlobalID mixin into AR Base's allowed set", () => {
    // globalid's railtie does `on_load(:active_record) { include
    // GlobalID::Identification }` — a dynamic include the static extractor
    // can't see, plus the module lives in a *different* package. Its instance
    // methods (toGid/toSgid family) must NOT be flagged as novel. The
    // trails-side Locator-backed finders (findGlobalId/findSignedGlobalId[Bang])
    // are NOT covered by the mixin — they have no Rails counterpart at all, so
    // they keep reporting as extras until they are removed or justified.
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        globalid: {
          classes: {},
          modules: {
            "GlobalID::Identification": rubyClass({
              name: "Identification",
              file: "identification.rb",
              instance: [method("to_global_id"), method("to_gid"), method("to_signed_global_id")],
            }),
          },
        },
        activerecord: {
          classes: {
            "ActiveRecord::Base": rubyClass({
              name: "Base",
              file: "base.rb",
              instance: [method("save")],
            }),
          },
          modules: {},
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        globalid: { classes: {}, modules: {} },
        activerecord: {
          classes: {
            Base: {
              name: "Base",
              file: "base.ts",
              includes: [],
              extends: [],
              instanceMethods: [
                method("save"),
                method("toGlobalId"), // from GlobalID::Identification (cross-package include)
                method("toGid"),
                method("toSignedGlobalId"),
              ],
              classMethods: [
                // trails-only model-side finders: no Rails counterpart and no
                // justification, so they stay visible as extra surface.
                method("findGlobalId"),
                method("findSignedGlobalId"),
                method("findSignedGlobalIdBang"),
                method("genuinelyNovel"),
              ],
            },
          },
          modules: {},
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: "activerecord",
      excludeGlobs: [],
      novelOnly: true,
      topN: 50,
    });
    const f = report.packages[0].extraFiles.find((x) => x.tsFile === "base.ts");
    expect(f).toBeDefined();
    expect(f!.extras.map((e) => e.name)).toEqual([
      "findGlobalId",
      "findSignedGlobalId",
      "findSignedGlobalIdBang",
      "genuinelyNovel",
    ]);
  });

  it("cross-package fallback does NOT let a bare short-name include pollute across gems", () => {
    // A bare `Helper` include in package `a` must resolve ONLY against a's own
    // module map — package `b`'s same-short-name `B::Helper` must not leak in
    // via the cross-package fallback (that fallback is FQN-keyed and only fires
    // for `::`-qualified includes, so a short name can never reach it).
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        a: {
          classes: {
            "A::Host": { ...rubyClass({ name: "Host", file: "host.rb" }), includes: ["Helper"] },
          },
          modules: {},
        },
        b: {
          classes: {},
          modules: {
            "B::Helper": rubyClass({
              name: "Helper",
              file: "helper.rb",
              instance: [method("foreign_method")],
            }),
          },
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        a: {
          classes: {
            Host: {
              name: "Host",
              file: "host.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("foreignMethod")],
              classMethods: [],
            },
          },
          modules: {},
        },
        b: { classes: {}, modules: {} },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: "a",
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    const f = report.packages[0].extraFiles.find((x) => x.tsFile === "host.ts");
    // foreignMethod IS flagged — B::Helper did not bleed into A::Host's allowed set.
    expect(f).toBeDefined();
    expect(f!.extras.map((e) => e.name)).toContain("foreignMethod");
  });

  it("does NOT pull an unported mixin's methods into the allowed set (stays extra)", () => {
    // Host `include Unportable`; Unportable's source is `promise.rb`, which
    // UNPORTED_FILES marks as deliberately not ported. Mirrors the
    // flattenIncludedMethodInfos guard (compare.ts:507): an unported mixin
    // must NOT contribute its methods to the host's allowed set, so its TS
    // port stays flagged as extra surface.
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        ar: {
          classes: {
            "P::Host": {
              ...rubyClass({ name: "Host", file: "host.rb" }),
              includes: ["Unportable"],
            },
          },
          modules: {
            "P::Unportable": rubyClass({
              name: "Unportable",
              file: "promise.rb",
              instance: [method("unported_method")],
            }),
          },
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        ar: {
          classes: {
            Host: {
              name: "Host",
              file: "host.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("unportedMethod")],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    const f = report.packages[0].extraFiles.find((x) => x.tsFile === "host.ts");
    expect(f).toBeDefined();
    // unportedMethod stays extra — the unported mixin never reached `allowed`.
    expect(f!.extras.map((e) => e.name)).toContain("unportedMethod");
  });

  it("folds a ported mirror of an unported mixin method back into allowed (PORTED_UNPORTED_MIXIN_METHODS)", () => {
    // ActiveRecord::AssociationNotFoundError `include DidYouMean::Correctable`,
    // whose source (core_ext/name_error.rb) is unported — so walkMixin skips it
    // and `detailedMessage` would show as a "moved" extra. We ported
    // detailed_message inline (associations/errors.ts), so
    // PORTED_UNPORTED_MIXIN_METHODS must fold it back into allowed while a
    // genuinely-extra name stays flagged.
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        "did-you-mean": {
          classes: {},
          modules: {
            "DidYouMean::Correctable": rubyClass({
              name: "Correctable",
              file: "core_ext/name_error.rb",
              instance: [method("detailed_message")],
            }),
          },
        },
        activerecord: {
          classes: {
            "ActiveRecord::AssociationNotFoundError": {
              ...rubyClass({ name: "AssociationNotFoundError", file: "host.rb" }),
              includes: ["DidYouMean::Correctable"],
            },
          },
          modules: {},
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        "did-you-mean": { classes: {}, modules: {} },
        activerecord: {
          classes: {
            AssociationNotFoundError: {
              name: "AssociationNotFoundError",
              file: "host.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("detailedMessage"), method("genuinelyNovel")],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: "activerecord",
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    const f = report.packages[0].extraFiles.find((x) => x.tsFile === "host.ts");
    expect(f).toBeDefined();
    // detailedMessage folded back in; only the genuinely-novel name remains.
    expect(f!.extras.map((e) => e.name)).toEqual(["genuinelyNovel"]);
  });

  it("folds railtie-reexported ControllerRuntime methods on the Railtie host into allowed", () => {
    // trailtie.ts re-exports Railties::ControllerRuntime (railtie.rb:267,
    // on_load(:action_controller) { include … }); its source
    // controller_runtime.rb is unported, so the ported process_action /
    // cleanup_view_runtime / append_info_to_payload mirrors would show as moved
    // extras without the PORTED_UNPORTED_MIXIN_METHODS["ActiveRecord::Railtie"]
    // fold-back. Guards the exact host FQN + method names against a typo.
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {
            "ActiveRecord::Railtie": rubyClass({ name: "Railtie", file: "railtie.rb" }),
          },
          modules: {},
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {},
          modules: {
            Trailtie: {
              name: "Trailtie",
              file: "trailtie.ts",
              includes: [],
              extends: [],
              instanceMethods: [],
              classMethods: [
                method("processAction"),
                method("cleanupViewRuntime"),
                method("appendInfoToPayload"),
                method("genuinelyNovel"),
              ],
            },
          },
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: "activerecord",
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    const f = report.packages[0].extraFiles.find((x) => x.tsFile === "trailtie.ts");
    expect(f).toBeDefined();
    expect(f!.extras.map((e) => e.name)).toEqual(["genuinelyNovel"]);
  });

  it("resolves the unported guard against a cross-package module's OWNING package", () => {
    // A cross-package `::`-qualified include where the module's source is
    // unported only in its OWN package (i18n_railtie.rb, scoped to
    // activesupport in UNPORTED_FILES). The guard must call isSourceUnported
    // with the owning package (activesupport) — not the host's (activerecord)
    // — or the package-scoped pattern wouldn't match and the methods would
    // wrongly become allowed.
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activesupport: {
          classes: {},
          modules: {
            "AS::Injected": rubyClass({
              name: "Injected",
              file: "i18n_railtie.rb",
              instance: [method("injected_method")],
            }),
          },
        },
        activerecord: {
          classes: {
            "ActiveRecord::Base": {
              ...rubyClass({ name: "Base", file: "base.rb", instance: [method("save")] }),
              includes: ["AS::Injected"],
            },
          },
          modules: {},
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activesupport: { classes: {}, modules: {} },
        activerecord: {
          classes: {
            Base: {
              name: "Base",
              file: "base.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("save"), method("injectedMethod")],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: "activerecord",
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    const f = report.packages[0].extraFiles.find((x) => x.tsFile === "base.ts");
    expect(f).toBeDefined();
    // injectedMethod stays extra — guard matched the activesupport-scoped
    // unported pattern via the module's owning package.
    expect(f!.extras.map((e) => e.name)).toContain("injectedMethod");
  });

  describe("integer-only flag validation", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("rejects non-integer --top and --max-detail", () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
        throw new Error(`exit:${code}`);
      });
      vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() => parseArgs(["--top", "3.7"])).toThrow(/exit:1/);
      expect(() => parseArgs(["--max-detail", "1.5"])).toThrow(/exit:1/);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  it("ranks files by novel count, not raw extra count", () => {
    // bigBarrel.ts: 0 novel, 5 moved.  smallNovel.ts: 2 novel, 0 moved.
    // smallNovel should outrank bigBarrel even though bigBarrel has more total.
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        p: {
          classes: {
            "P::Barrel": rubyClass({ name: "Barrel", file: "big_barrel.rb" }),
            "P::Small": rubyClass({ name: "Small", file: "small_novel.rb" }),
            "P::Origins": rubyClass({
              name: "Origins",
              file: "origins.rb",
              instance: [method("a"), method("b"), method("c"), method("d"), method("e")],
            }),
          },
          modules: {},
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        p: {
          classes: {
            Barrel: {
              name: "Barrel",
              file: "big-barrel.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("a"), method("b"), method("c"), method("d"), method("e")],
              classMethods: [],
            },
            Small: {
              name: "Small",
              file: "small-novel.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("novelOne"), method("novelTwo")],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    expect(report.topN.map((f) => f.tsFile)).toEqual(["small-novel.ts", "big-barrel.ts"]);
    expect(report.topN[0].novelCount).toBe(2);
    expect(report.topN[1].novelCount).toBe(0);
    expect(report.topN[1].movedCount).toBe(5);
  });
});

describe("collectTsFileNames — `__mixin` pseudo-modules", () => {
  function extract(files: Record<string, string>): PackageInfo {
    const srcDir = "/p";
    const all: Record<string, string> = {};
    for (const [rel, src] of Object.entries(files)) all[`${srcDir}/${rel}`] = src;
    const names = Object.keys(all);
    const host: ts.CompilerHost = {
      getSourceFile: (name) =>
        all[name] === undefined
          ? undefined
          : ts.createSourceFile(name, all[name], ts.ScriptTarget.Latest, true),
      getDefaultLibFileName: () => "lib.d.ts",
      writeFile: () => undefined,
      getCurrentDirectory: () => "/",
      getCanonicalFileName: (n) => n,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
      fileExists: (name) => name in all,
      readFile: (name) => all[name],
      resolveModuleNames: (moduleNames, containingFile) =>
        moduleNames.map((m) => {
          if (!m.startsWith("./") && !m.startsWith("../")) return undefined;
          const dir = path.posix.dirname(containingFile);
          const candidate = path.posix.normalize(`${dir}/${m.replace(/\.js$/, "")}.ts`);
          return candidate in all
            ? { resolvedFileName: candidate, extension: ts.Extension.Ts }
            : undefined;
        }),
    };
    const program = ts.createProgram(
      names,
      { noLib: true, target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext },
      host,
    );
    return extractFromProgram(program, srcDir);
  }

  const FILES = {
    "base.ts": `
      export class Base {
        toSlug(): string { return ""; }
      }
    `,
    "inheritance.ts": `
      import { Base } from "./base.js";
      export function stiClassFor(this: typeof Base, typeName: string): typeof Base {
        return Base;
      }
    `,
  };

  it("drops host-interface members that inheritance.ts does not declare", () => {
    const info = extract(FILES);
    const mixin = info.modules["inheritance.ts:stiClassFor__mixin"];
    expect(mixin?.synthesizedMixin).toBe(true);
    expect(mixin.instanceMethods.find((m) => m.name === "toSlug")?.declaredIn).toBe("base.ts");

    const names = collectTsFileNames(
      "inheritance.ts",
      [],
      Object.values(info.modules),
      info.fileFunctions?.["inheritance.ts"],
    );
    expect(names.has("toSlug")).toBe(false);
  });

  it("still counts the mixin function's own name as inheritance.ts surface", () => {
    const info = extract(FILES);
    const names = collectTsFileNames(
      "inheritance.ts",
      [],
      Object.values(info.modules),
      info.fileFunctions?.["inheritance.ts"],
    );
    expect(names.has("stiClassFor")).toBe(true);
  });
});

describe("buildReport — re-export clones", () => {
  it("charges a barrel only with the classes it declares itself", () => {
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activemodel: {
          classes: {
            "ActiveModel::Foo": rubyClass({ name: "Foo", file: "foo.rb" }),
            "ActiveModel::Barrel": rubyClass({ name: "Barrel", file: "barrel.rb" }),
          },
          modules: {},
        },
      },
    };
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activemodel: {
          classes: {
            "foo.ts:Foo": {
              name: "Foo",
              file: "foo.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("declaredOnFoo")],
              classMethods: [],
            },
            "barrel.ts:Foo": {
              name: "Foo",
              file: "barrel.ts",
              reExportedFrom: "foo.ts:Foo",
              includes: [],
              extends: [],
              instanceMethods: [method("declaredOnFoo")],
              classMethods: [],
            },
            "barrel.ts:Barrel": {
              name: "Barrel",
              file: "barrel.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("declaredOnBarrel")],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };

    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    const byFile = new Map(report.packages[0].extraFiles.map((f) => [f.tsFile, f]));
    expect(byFile.get("foo.ts")!.extras.map((e) => e.name)).toEqual(["declaredOnFoo"]);
    expect(byFile.get("barrel.ts")!.extras.map((e) => e.name)).toEqual(["declaredOnBarrel"]);
  });
});

describe("buildReport — @noRailsEquivalent tags", () => {
  function makeManifests(reason?: string): { ruby: ApiManifest; ts: ApiManifest } {
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activemodel: {
          classes: {
            "ActiveModel::Foo": rubyClass({
              name: "Foo",
              file: "foo.rb",
              instance: [method("bar")],
            }),
          },
          modules: {},
        },
      },
    };
    const tagged: MethodInfo = { ...method("tsOnlyHelper") };
    if (reason !== undefined) tagged.noRailsEquivalent = reason;
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activemodel: {
          classes: {
            Foo: {
              name: "Foo",
              file: "foo.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("bar"), tagged],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };
    return { ruby, ts };
  }

  const run = (m: { ruby: ApiManifest; ts: ApiManifest }) =>
    buildReport(m.ruby, m.ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });

  it("counts a tagged extra as allowlisted instead of novel", () => {
    const report = run(makeManifests("public registry seam, no Rails counterpart"));
    const pkg = report.packages[0];
    expect(pkg.totalNovel).toBe(0);
    expect(pkg.totalAllowlisted).toBe(1);
    expect(pkg.extraFiles).toEqual([]);
    expect(report.tagged).toEqual({ total: 1, matched: 1, stale: [] });
    expect(report).not.toHaveProperty("allowlist");
  });

  it("reports the tagged extra as novel when the tag is absent", () => {
    const pkg = run(makeManifests()).packages[0];
    expect(pkg.totalNovel).toBe(1);
    expect(pkg.totalAllowlisted).toBe(0);
  });

  it("matches a tagged extra under --novel-only, so the tag isn't stale", () => {
    const report = buildReport(
      makeManifests("no counterpart").ruby,
      makeManifests("no counterpart").ts,
      {
        filterPkg: null,
        excludeGlobs: [],
        novelOnly: true,
        topN: 50,
      },
    );
    expect(report.tagged.stale).toEqual([]);
    expect(report.packages[0].totalAllowlisted).toBe(1);
  });

  it("reports a tag on a name that does not flag as extra surface as stale", () => {
    const m = makeManifests("no counterpart");
    m.ts.packages.activemodel.classes.Foo.instanceMethods[0].noRailsEquivalent = "no counterpart";
    const report = run(m);
    expect(report.tagged.stale.map((e) => e.name)).toEqual(["bar"]);
    expect(report.tagged.matched).toBe(1);
  });

  it("reports a class-declaration tag on a name that does not flag as extra surface as stale", () => {
    const m = makeManifests("no counterpart");
    m.ts.packages.activemodel.classes.Foo.noRailsEquivalent = "no counterpart";
    const report = run(m);
    expect(report.tagged.stale.map((e) => e.name)).toEqual(["Foo"]);
    expect(report.tagged.matched).toBe(1);
  });

  it("allows a tagged interface's members without counting or staling the inherited entries", () => {
    const m = makeManifests();
    m.ts.packages.activemodel.modules.Shape = {
      name: "Shape",
      file: "foo.ts",
      includes: [],
      extends: [],
      // `bar` has a Rails counterpart and never flags as extra; only
      // `tsOnlyHelper` does. Neither may be reported stale — the one tag is
      // written on the declaration, so there is nothing per-member to delete.
      instanceMethods: [method("bar"), method("tsOnlyHelper")],
      classMethods: [],
      isInterface: true,
      noRailsEquivalent: "duck-typed collaborator shape",
    };
    const report = run(m);
    expect(report.packages[0].totalNovel).toBe(0);
    expect(report.packages[0].totalAllowlisted).toBe(1);
    expect(report.tagged).toEqual({ total: 0, matched: 1, stale: [] });
  });

  it("does not judge tags of packages this run never scanned", () => {
    const report = buildReport(
      makeManifests("no counterpart").ruby,
      makeManifests("no counterpart").ts,
      {
        filterPkg: "activerecord",
        excludeGlobs: [],
        novelOnly: false,
        topN: 50,
      },
    );
    expect(report.tagged.stale).toEqual([]);
  });
});

describe("collectTaggedEntries", () => {
  it("collects tags from class members and file functions, deduping repeated keys", () => {
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {
            Foo: {
              name: "Foo",
              file: "foo.ts",
              includes: [],
              extends: [],
              instanceMethods: [{ ...method("helper"), noRailsEquivalent: "why" }],
              classMethods: [{ ...method("helper"), noRailsEquivalent: "why" }],
            },
          },
          modules: {},
          fileFunctions: {
            "associations.ts": [{ ...method("registerModel"), noRailsEquivalent: "public seam" }],
          },
        },
      },
    };
    expect(collectTaggedEntries(ts)).toEqual([
      { package: "activerecord", tsFile: "foo.ts", name: "helper", reason: "why" },
      {
        package: "activerecord",
        tsFile: "associations.ts",
        name: "registerModel",
        reason: "public seam",
      },
    ]);
  });

  it("keeps the member's reason when a member shares the container's name", () => {
    // Both spellings occupy the one key the extra set has for the name, so
    // only one reason can be reported; the member's is the specific one.
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {
            Foo: {
              name: "Foo",
              file: "foo.ts",
              includes: [],
              extends: [],
              instanceMethods: [],
              classMethods: [{ ...method("Foo"), noRailsEquivalent: "the member reason" }],
              noRailsEquivalent: "the declaration reason",
            },
          },
          modules: {},
        },
      },
    };
    expect(collectTaggedEntries(ts)).toEqual([
      { package: "activerecord", tsFile: "foo.ts", name: "Foo", reason: "the member reason" },
    ]);
  });

  it("collects a tag written on the class declaration itself", () => {
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {
            NullConfig: {
              name: "NullConfig",
              file: "connection-pool.ts",
              includes: [],
              extends: [],
              instanceMethods: [],
              classMethods: [],
              noRailsEquivalent: "Rails nests this class inside NullPool",
            },
            NullPool: {
              name: "NullPool",
              file: "connection-pool.ts",
              includes: [],
              extends: [],
              instanceMethods: [],
              classMethods: [method("NullConfig")],
            },
          },
          modules: {},
        },
      },
    };
    expect(collectTaggedEntries(ts)).toEqual([
      {
        package: "activerecord",
        tsFile: "connection-pool.ts",
        name: "NullConfig",
        reason: "Rails nests this class inside NullPool",
      },
    ]);
  });

  it("spreads a tagged interface's declaration reason onto its members", () => {
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        globalid: {
          classes: {},
          modules: {
            LocatorModel: {
              name: "LocatorModel",
              file: "locator.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("find"), { ...method("where"), noRailsEquivalent: "own" }],
              classMethods: [],
              isInterface: true,
              noRailsEquivalent: "duck-typed collaborator shape",
            },
          },
        },
      },
    };
    expect(collectTaggedEntries(ts)).toEqual([
      // The member's own tag still wins over the inherited one.
      { package: "globalid", tsFile: "locator.ts", name: "where", reason: "own" },
      {
        package: "globalid",
        tsFile: "locator.ts",
        name: "LocatorModel",
        reason: "duck-typed collaborator shape",
        inherited: true,
      },
      {
        package: "globalid",
        tsFile: "locator.ts",
        name: "find",
        reason: "duck-typed collaborator shape",
        inherited: true,
      },
    ]);
  });

  it("does not spread a tagged CLASS declaration's reason onto its members", () => {
    const ts: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {
            NullConfig: {
              name: "NullConfig",
              file: "connection-pool.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("schemaCache")],
              classMethods: [],
              noRailsEquivalent: "Rails nests this class inside NullPool",
            },
          },
          modules: {},
        },
      },
    };
    expect(collectTaggedEntries(ts).map((e) => e.name)).toEqual(["NullConfig"]);
  });
});

describe("@noRailsEquivalent — extractor to report", () => {
  function extract(files: Record<string, string>): PackageInfo {
    const srcDir = "/p";
    const all: Record<string, string> = {};
    for (const [rel, src] of Object.entries(files)) all[`${srcDir}/${rel}`] = src;
    const host: ts.CompilerHost = {
      getSourceFile: (name) =>
        all[name] === undefined
          ? undefined
          : ts.createSourceFile(name, all[name], ts.ScriptTarget.Latest, true),
      getDefaultLibFileName: () => "lib.d.ts",
      writeFile: () => undefined,
      getCurrentDirectory: () => "/",
      getCanonicalFileName: (n) => n,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
      fileExists: (name) => name in all,
      readFile: (name) => all[name],
    };
    const program = ts.createProgram(
      Object.keys(all),
      { noLib: true, noResolve: true, target: ts.ScriptTarget.Latest },
      host,
    );
    return extractFromProgram(program, srcDir);
  }

  it("carries a tag written in TS source through to the Allowed totals", () => {
    const tsPkg = extract({
      "associations.ts": `
        export class Associations {
          hasMany(): void {}

          /** @noRailsEquivalent public model registry, no Rails counterpart */
          registerModel(): void {}
        }
      `,
    });
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {
            "ActiveRecord::Associations": rubyClass({
              name: "Associations",
              file: "associations.rb",
              instance: [method("has_many")],
            }),
          },
          modules: {},
        },
      },
    };
    const ts_: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: { activerecord: tsPkg },
    };
    const report = buildReport(ruby, ts_, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    expect(report.tagged).toEqual({
      total: 1,
      matched: 1,
      stale: [],
    });
    expect(report.packages[0].totalAllowlisted).toBe(1);
    expect(report.packages[0].totalNovel).toBe(0);
    expect(report.packages[0].extraFiles).toEqual([]);
  });

  it("carries a tag written on a class DECLARATION through to the Allowed totals", () => {
    // The live NullPool/NullConfig shape: Rails nests the class, TS exports it
    // as a sibling and re-attaches it as a static, so the extra name is the
    // class's own — and the declaration is the only place to justify it.
    const tsPkg = extract({
      "connection-pool.ts": `
        /** @noRailsEquivalent Rails nests this class inside NullPool; TS cannot */
        export class NullConfig {}

        export class NullPool {
          static readonly NullConfig = NullConfig;

          schemaCache(): void {}
        }
      `,
    });
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {
            "ActiveRecord::ConnectionAdapters::NullPool": rubyClass({
              name: "NullPool",
              file: "connection_pool.rb",
              instance: [method("schema_cache")],
            }),
          },
          modules: {},
        },
      },
    };
    const report = buildReport(
      ruby,
      { source: "typescript", generatedAt: "", packages: { activerecord: tsPkg } },
      { filterPkg: null, excludeGlobs: [], novelOnly: false, topN: 50 },
    );
    expect(report.tagged).toEqual({ total: 1, matched: 1, stale: [] });
    expect(report.packages[0].totalAllowlisted).toBe(1);
    expect(report.packages[0].totalNovel).toBe(0);
  });
});

describe("buildReport — TS files with no Rails counterpart", () => {
  function makeManifests(tsFile: string): { ruby: ApiManifest; ts: ApiManifest } {
    // Rails: active_record.rb declares the umbrella writer `foo=`; it maps
    // onto base.ts, so nothing in the file map points at `tsFile`.
    const ruby: ApiManifest = {
      source: "ruby",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {
            "ActiveRecord::Base": rubyClass({
              name: "Base",
              file: "base.rb",
              instance: [method("foo=")],
            }),
          },
          modules: {},
        },
      },
    };
    const ts_: ApiManifest = {
      source: "typescript",
      generatedAt: "",
      packages: {
        activerecord: {
          classes: {
            Base: {
              name: "Base",
              file: "base.ts",
              includes: [],
              extends: [],
              instanceMethods: [method("foo")],
              classMethods: [],
            },
          },
          modules: {},
          fileFunctions: { [tsFile]: [method("setFoo"), method("foo")] },
        },
      },
    };
    return { ruby, ts: ts_ };
  }

  it("scores a file no Ruby file maps onto instead of skipping it", () => {
    const { ruby, ts: ts_ } = makeManifests("ar-config.ts");
    const report = buildReport(ruby, ts_, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    const files = report.packages[0].extraFiles;
    expect(files.map((f) => f.tsFile)).toEqual(["ar-config.ts"]);
    // `foo=` maps to `foo`, so the `setX` re-spelling is novel and the reader
    // is moved (base.ts owns it) — the whole file is measured, not skipped.
    expect(files[0].rubyFile).toBeNull();
    expect(files[0].extras.map((e) => [e.name, e.kind])).toEqual([
      ["setFoo", "novel"],
      ["foo", "moved"],
    ]);
  });

  it("breaks the no-counterpart slice out of the package totals", () => {
    const { ruby, ts: ts_ } = makeManifests("ar-config.ts");
    const report = buildReport(ruby, ts_, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    const pkg = report.packages[0];
    expect(pkg.totalExtras).toBe(2);
    expect(pkg.noCounterpartFiles).toBe(1);
    expect(pkg.noCounterpartExtras).toBe(2);
    expect(pkg.noCounterpartNovel).toBe(1);
  });

  it("treats a Ruby file known only by its file-level constants as a counterpart", () => {
    const { ruby, ts: ts_ } = makeManifests("cipher.ts");
    // cipher.rb declares a constant and no class the extractor picked up; the
    // literal pass still maps it through rubyFileToTs (compare.ts:1838-1841).
    ruby.packages["activerecord"].fileConstants = {
      "cipher.rb": { DEFAULT_ENCODING: { kind: "expr" } },
    };
    ts_.packages["activerecord"].fileFunctions = {
      "cipher.ts": [method("DEFAULT_ENCODING"), method("setFoo")],
    };
    const report = buildReport(ruby, ts_, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    const f = report.packages[0].extraFiles[0];
    expect(f.tsFile).toBe("cipher.ts");
    expect(f.rubyFile).toBe("cipher.rb");
    // The constant is allowed by its own Rails file, so only `setFoo` flags —
    // and the file is NOT counted against the no-counterpart population.
    expect(f.extras.map((e) => e.name)).toEqual(["setFoo"]);
    expect(report.packages[0].noCounterpartFiles).toBe(0);
  });

  it("holds out trees that mirror Rails test code rather than lib", () => {
    const { ruby, ts: ts_ } = makeManifests("test-helpers/models/post.ts");
    const report = buildReport(ruby, ts_, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    expect(report.packages[0].extraFiles).toEqual([]);
  });

  it("still scores test-fixtures/, the split of lib's test_fixtures.rb", () => {
    const { ruby, ts: ts_ } = makeManifests("test-fixtures/fixture-connection.ts");
    const report = buildReport(ruby, ts_, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
    });
    expect(report.packages[0].extraFiles.map((f) => f.tsFile)).toEqual([
      "test-fixtures/fixture-connection.ts",
    ]);
  });

  it("honours --exclude-glob for a file with no counterpart", () => {
    const { ruby, ts: ts_ } = makeManifests("ar-config.ts");
    const report = buildReport(ruby, ts_, {
      filterPkg: null,
      excludeGlobs: ["ar-config"],
      novelOnly: false,
      topN: 50,
    });
    expect(report.packages[0].extraFiles).toEqual([]);
  });
});
