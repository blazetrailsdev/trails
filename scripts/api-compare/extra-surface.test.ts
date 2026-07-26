import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { tmpdir } from "os";
import * as ts from "typescript";
import type { ApiManifest, ClassInfo, MethodInfo, PackageInfo } from "./types.js";
import {
  buildGlobalRubyCandidates,
  buildReport,
  findInvalidAllowEntries,
  loadAllowlist,
  resolveAllowlist,
  parseArgs,
  collectTsFileNames,
} from "./extra-surface.js";
import { extractFromProgram } from "./extract-ts-api.js";
import type { AllowEntry } from "./extra-surface.js";

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

  it("doesn't flag predicate-Q, column-DSL, value-method, or JS-protocol names as novel", () => {
    // Rails foo.rb defines a `?` predicate; the column-type DSL
    // (`define_column_methods`) and Relation value-method accessors
    // (`VALUE_METHODS.each`) are now modeled by the Ruby extractor, so they
    // appear in the manifest like ordinary methods. JS-protocol methods are
    // language-level and filtered TS-side.
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
                method("catch"), // JS Promise protocol
                method("genuinelyNovel"), // the only real extra
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
    expect(report.packages[0].extraFiles[0].extras.map((e) => e.name)).toEqual(["genuinelyNovel"]);
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

  it("skips nested classes sharing a file with a shorter-named parent (matches compare.ts)", () => {
    // Nested Preloader::Association::LoaderQuery in association.rb is an
    // impl detail; its `nestedHelper` must NOT count as allowed for the
    // matched TS file. Per compare.ts:738-755.
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
    const f = report.packages[0].extraFiles.find((x) => x.tsFile === "preloader/association.ts");
    expect(f).toBeDefined();
    // primaryMethod allowed; nestedHelper flagged (nested class is skipped).
    expect(f!.extras.map((e) => e.name)).toEqual(["nestedHelper"]);
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
    // methods (toGid/toSgid family) and the trails-side Locator-backed finders
    // (findGlobalId/findSignedGlobalId[Bang]) must NOT be flagged as novel.
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
                method("findGlobalId"), // ambient railtie finder (no static Ruby def)
                method("findSignedGlobalId"),
                method("findSignedGlobalIdBang"),
                method("genuinelyNovel"), // the only real extra
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
    expect(f!.extras.map((e) => e.name)).toEqual(["genuinelyNovel"]);
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

describe("buildReport — reasoned allowlist", () => {
  function makeManifests(): { ruby: ApiManifest; ts: ApiManifest } {
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

  const allowEntry = (name: string): AllowEntry => ({
    package: "activemodel",
    tsFile: "foo.ts",
    name,
    reason: "TS-idiom accessor with no Rails counterpart.",
  });

  it("subtracts an allowlisted extra from the novel count and reports it separately", () => {
    const { ruby, ts } = makeManifests();
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
      allow: [allowEntry("tsOnlyHelper")],
    });
    const pkg = report.packages[0];
    expect(pkg.totalNovel).toBe(0);
    expect(pkg.totalMoved).toBe(1);
    expect(pkg.totalAllowlisted).toBe(1);
    expect(pkg.extraFiles[0].allowlistedCount).toBe(1);
    expect(pkg.extraFiles[0].extras.map((e) => e.name)).toEqual(["quux"]);
    expect(report.allowlist).toEqual({ total: 1, matched: 1, stale: [] });
  });

  it("keeps the package total when every extra of a file is allowlisted", () => {
    const { ruby, ts } = makeManifests();
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
      allow: [allowEntry("tsOnlyHelper"), allowEntry("quux")],
    });
    const pkg = report.packages[0];
    expect(pkg.extraFiles).toEqual([]);
    expect(pkg.filesWithDrift).toBe(0);
    expect(pkg.totalAllowlisted).toBe(2);
    expect(report.allowlist.matched).toBe(2);
  });

  it("matches a moved extra even under --novel-only, so the entry isn't stale", () => {
    const { ruby, ts } = makeManifests();
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: true,
      topN: 50,
      allow: [allowEntry("quux")],
    });
    expect(report.allowlist.stale).toEqual([]);
    expect(report.packages[0].totalAllowlisted).toBe(1);
  });

  it("reports an entry that no longer flags as stale", () => {
    const { ruby, ts } = makeManifests();
    const report = buildReport(ruby, ts, {
      filterPkg: null,
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
      allow: [allowEntry("bar")],
    });
    expect(report.allowlist.stale.map((e) => e.name)).toEqual(["bar"]);
  });

  it("does not judge entries of packages this run never scanned", () => {
    const { ruby, ts } = makeManifests();
    const report = buildReport(ruby, ts, {
      filterPkg: "activerecord",
      excludeGlobs: [],
      novelOnly: false,
      topN: 50,
      allow: [allowEntry("bar")],
    });
    expect(report.packages).toEqual([]);
    expect(report.allowlist.stale).toEqual([]);
  });
});

describe("findInvalidAllowEntries", () => {
  it("flags an empty reason", () => {
    expect(
      findInvalidAllowEntries([
        { package: "activemodel", tsFile: "foo.ts", name: "helper", reason: "  " },
      ]),
    ).toEqual(["empty reason: activemodel foo.ts helper"]);
  });

  it("flags a duplicate key", () => {
    const e: AllowEntry = {
      package: "activemodel",
      tsFile: "foo.ts",
      name: "helper",
      reason: "kept",
    };
    expect(findInvalidAllowEntries([e, { ...e }])).toEqual([
      "duplicate key: activemodel foo.ts helper",
    ]);
  });

  it("accepts a well-formed entry", () => {
    expect(
      findInvalidAllowEntries([
        { package: "activemodel", tsFile: "foo.ts", name: "helper", reason: "kept" },
      ]),
    ).toEqual([]);
  });
});

describe("loadAllowlist", () => {
  it("rejects a missing file with an actionable message", async () => {
    await expect(loadAllowlist("scripts/api-compare/does-not-exist.json")).rejects.toThrow(
      /Missing does-not-exist\.json/,
    );
  });

  it("rejects a file that is not a JSON array", async () => {
    const file = path.join(await fs.mkdtemp(path.join(tmpdir(), "extra-surface-")), "allow.json");
    await fs.writeFile(file, JSON.stringify({ package: "activemodel" }));
    await expect(loadAllowlist(file)).rejects.toThrow(/must be a JSON array/);
  });

  it("parses the committed allowlist, which is well-formed", async () => {
    expect(findInvalidAllowEntries(await loadAllowlist())).toEqual([]);
  });
});

describe("resolveAllowlist", () => {
  async function writeAllow(contents: string): Promise<string> {
    const file = path.join(await fs.mkdtemp(path.join(tmpdir(), "extra-surface-")), "allow.json");
    await fs.writeFile(file, contents);
    return file;
  }

  it("degrades an unreadable file to no suppressions, reporting the problem", async () => {
    const r = await resolveAllowlist("scripts/api-compare/does-not-exist.json");
    expect(r.allow).toEqual([]);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/Missing does-not-exist\.json/);
  });

  it("degrades a malformed entry to no suppressions, so the report never gates", async () => {
    const file = await writeAllow(
      JSON.stringify([{ package: "activemodel", tsFile: "foo.ts", name: "helper", reason: "" }]),
    );
    const r = await resolveAllowlist(file);
    expect(r.allow).toEqual([]);
    expect(r.problems).toEqual(["empty reason: activemodel foo.ts helper"]);
  });

  it("returns the entries when the file is well-formed", async () => {
    const entry = {
      package: "activemodel",
      tsFile: "foo.ts",
      name: "helper",
      reason: "TS-idiom accessor.",
    };
    const r = await resolveAllowlist(await writeAllow(JSON.stringify([entry])));
    expect(r).toEqual({ allow: [entry], problems: [] });
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
