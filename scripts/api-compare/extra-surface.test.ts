import { describe, it, expect, vi, afterEach } from "vitest";
import type { ApiManifest, ClassInfo, MethodInfo } from "./types.js";
import { buildGlobalRubyCandidates, buildReport, parseArgs } from "./extra-surface.js";

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
  it("unions public Ruby method TS-candidates across all packages, skipping internal", () => {
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
    expect(set.has("privateOne")).toBe(false);
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
