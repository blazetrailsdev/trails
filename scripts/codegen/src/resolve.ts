/**
 * Pass 3 + 5: constant resolution / import planning, and receiver-keyed member
 * resolution for self-calls and calls on gem constants.
 *
 * Constant order (Ruby's own lookup): lexical scopes, ancestors of the
 * innermost class, top level — inside the gem first; then the trails
 * dependency packages by namespace (`Arel::`, `ActiveSupport::`,
 * `ActiveModel::`); then Ruby core through ruby-compat or a JS global.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { GEM, ROOT, handNamespaceFqns } from "./gem.js";
import { TS_CLASS_RENAMES, rubyFileToTs } from "../../parity/conventions.js";
import { TS_CONSTANT_RENAMES, tsConstantRenameKey } from "./constant-renames.js";
import type { N, Param } from "./ir.js";
import { GemIndex, lexicalChain, type ScopeInfo } from "./gem-index.js";
import type { Ctx, Lowerer } from "./lower.js";
import type { TypeOracle, TypeRef } from "./types.js";
import { propName, tsMethodName } from "./lower.js";

const FOREIGN_GEM_ROOTS = new Set([
  "ActiveRecord",
  "ActionView",
  "ActionController",
  "ActionDispatch",
  "ActionMailer",
]);

const JS_GLOBALS: Record<string, string> = {
  Object: "Object",
  Array: "Array",
  String: "String",
  Integer: "Number",
  Float: "Number",
  Numeric: "Number",
  Symbol: "String",
  Proc: "Function",
  Math: "Math",
  Regexp: "RegExp",
  Date: "Date",
  Error: "Error",
  Exception: "Error",
};

/** Ruby namespaces whose constants live in a trails dependency package. */
const DEP_ROOT_PACKAGES: Record<string, string> = {
  ActiveModel: "@blazetrails/activemodel",
  ActiveSupport: "@blazetrails/activesupport",
};

/** Dependency classes ported as a package export of the same name. */
const DEP_CLASS_PKG: Record<string, string> = { GlobalID: "@blazetrails/globalid" };

export class Resolver {
  wanted = new Map<string, number>();
  unresolvedConsts = new Map<string, number>();
  private exportsByPkg: Record<string, Set<string>>;
  /** fqn → TS export name, assigned by the emitter (classes/modules it emits). */
  exportNames = new Map<string, { tsFile: string; name: string }>();
  /** Async member names per gem fqn (from the async pass). */
  asyncDefs = new Set<string>();
  /** Ruby names of gem methods some caller hands an async block. */
  asyncYielders = new Set<string>();
  /** Generated files with an unresolved-constant decline (see cli.ts). */
  unresolvedFiles = new Set<string>();

  constructor(
    readonly index: GemIndex,
    exportsFile: string,
    readonly types: TypeOracle,
  ) {
    const raw = JSON.parse(readFileSync(exportsFile, "utf8")) as Record<string, string[]>;
    this.newables = new Set(raw["#newables"] ?? []);
    this.exportsByPkg = Object.fromEntries(
      Object.entries(raw)
        .filter(([k]) => !k.startsWith("#"))
        .map(([k, v]) => [k, new Set(v)]),
    );
  }

  /** Dependency exports ported as an object with its own `new` (`TaggedLogging`). */
  newables: Set<string>;

  /** A dependency's class-level writer ported as a flat `setX` export (`Time.zone=` → `setZone`). */
  depFlatSetter(p: string[], rubyName: string, ctx: Ctx, lw: Lowerer): string | null {
    const segs = p[0] === "" ? p.slice(1) : p;
    if (segs.length !== 1 || this.index.resolveConst(p, ctx.nesting)) return null;
    const base = tsMethodName(rubyName.slice(0, -1));
    const fn = `set${base[0].toUpperCase()}${base.slice(1)}`;
    // `Time.zone=` (core_ext/time/zones.rb) is activesupport's `setZone`.
    if (segs[0] === "Time" && this.pkgExports("@blazetrails/activesupport").has(fn))
      return lw.imp(ctx, "@blazetrails/activesupport", fn);
    // `I18n` is the i18n package's module namespace (activesupport i18n.ts):
    // its writers are `I18n.setX` members.
    if (segs[0] === "I18n") {
      const idx = path.join(ROOT, "packages/i18n/src/index.ts");
      const text = existsSync(idx) ? readFileSync(idx, "utf8") : "";
      return new RegExp(`\\b${fn}\\b`).test(text)
        ? `${lw.imp(ctx, "@blazetrails/activesupport", "I18n")}.${fn}`
        : null;
    }
    // A class a dependency package exports whose writer it ports as `static setX`
    // (globalid's `GlobalID.app=`, global_id.rb:31 → `GlobalID.setApp`).
    const spec = DEP_CLASS_PKG[segs[0]];
    if (spec && this.pkgExports(spec).has(segs[0])) {
      const dist = path.join(ROOT, "packages", spec.split("/")[1], "dist");
      const walk = (d: string): string[] =>
        existsSync(d)
          ? readdirSync(d, { withFileTypes: true }).flatMap((e) =>
              e.isDirectory()
                ? walk(path.join(d, e.name))
                : e.name.endsWith(".d.ts")
                  ? [path.join(d, e.name)]
                  : [],
            )
          : [];
      const re = new RegExp(`\\bclass ${segs[0]}\\b[\\s\\S]*?\\bstatic ${fn}\\(`);
      if (walk(dist).some((f) => re.test(readFileSync(f, "utf8"))))
        return `${this.importPkg(spec, segs[0], "", ctx, lw)}.${fn}`;
    }
    return null;
  }

  pkgExports(spec: string): Set<string> {
    return this.exportsByPkg[spec] ?? new Set();
  }

  tsFileOf(rubyFile: string): string {
    return rubyFileToTsAr(rubyFile);
  }

  /** Import a package export, aliased when the file declares the same name itself. */
  importPkg(spec: string, name: string, prefix: string, ctx: Ctx, lw: Lowerer): string {
    const local = ctx.f.usedLocalNames.has(name) ? `${prefix || "Pkg"}${name}` : name;
    return lw.imp(ctx, spec, name, local);
  }

  /** Reference to a gem fqn (class/module/constant) from the current file, importing as needed. */
  fqnRef(fqn: string, ctx: Ctx, lw: Lowerer): string {
    // CLAUDE.md: ActiveRecord::Promise (and ::Complete) is the native promise.
    if (fqn === "ActiveRecord::Promise" || fqn === "ActiveRecord::Promise::Complete")
      return "Promise";
    // A namespace the hand port seats in `namespaces.ts` is read from there,
    // which imports nothing, so a child module reaching its parent closes no cycle.
    const seat = handNamespaceFqns().get(fqn);
    // Read as `any`: the generated module functions keep state on the object
    // (`ActiveRecord._schemaFormat`), which the hand port's type does not list.
    if (seat && ctx.f.tsFile !== "namespaces.ts")
      return `(${lw.imp(ctx, "@root/namespaces.js", seat, ctx.f.usedLocalNames.has(seat) ? `${seat}Seat` : seat)} as any)`;
    // An autoloaded constant named in a test (`ActiveJob::QueueAdapters::SidekiqAdapter`
    // in a `case` arm) is read off its module when reached, as Ruby's autoload
    // loads it then: importing it would load every adapter's backend gem.
    if (
      this.index.autoloads.has(fqn) &&
      ctx.f.rubyFile.startsWith("test/") &&
      [...(this.index.scopes.get(fqn)?.files ?? [])].some((f) => this.index.externalFiles.has(f))
    ) {
      const i = fqn.lastIndexOf("::");
      return `${this.fqnRef(fqn.slice(0, i), ctx, lw)}.${fqn.slice(i + 2)}`;
    }
    const exp = this.exportNames.get(fqn);
    if (exp) return this.importFrom(exp.tsFile, exp.name, ctx, lw);
    const c = this.index.consts.get(fqn);
    if (c) {
      const owner = fqn.slice(0, fqn.lastIndexOf("::"));
      const constName = fqn.slice(fqn.lastIndexOf("::") + 2);
      const ownerScope = this.index.scopes.get(owner);
      if (ownerScope?.kind === "class") return `${this.fqnRef(owner, ctx, lw)}.${constName}`;
      return this.importFrom(this.tsFileOf(c.file), constName, ctx, lw);
    }
    // Namespace-only module: no emitted object.
    const s = this.index.scopes.get(fqn);
    if (s) {
      this.unresolvedConsts.set(fqn, (this.unresolvedConsts.get(fqn) ?? 0) + 1);
      return lw.decline(ctx, "const-unresolved", { k: "const" } as N, fqn);
    }
    return lw.decline(ctx, "const-unresolved", { k: "const" } as N, fqn);
  }

  importFrom(tsFile: string, name: string, ctx: Ctx, lw: Lowerer): string {
    if (tsFile === ctx.f.tsFile) return name;
    let local = name;
    // Avoid clashing with a name the file itself declares or another import took.
    const taken = (l: string) => {
      if (ctx.f.usedLocalNames.has(l)) return true;
      for (const [spec, m] of ctx.f.imports)
        for (const [exp, loc] of m)
          if (loc === l && !(spec === `@root/${tsFile}` && exp === name)) return true;
      return false;
    };
    if (taken(local) && !taken(`Base${name}`)) local = `Base${name}`;
    if (taken(local)) {
      const prefix = path.posix
        .basename(tsFile, ".ts")
        .replace(/(^|-)(\w)/g, (_m, _d, c: string) => c.toUpperCase());
      local = `${prefix}${name}`;
      let i = 2;
      while (taken(local)) local = `${prefix}${name}${i++}`;
    }
    return lw.imp(ctx, `@root/${tsFile.replace(/\.ts$/, ".js")}`, name, local);
  }

  /**
   * trails exports a dependency's nested constants flat (`ActiveModel::Type::Helpers::Mutable`
   * is activemodel's `Mutable`, not `Type.Helpers.Mutable`), so the deepest
   * segment the package exports is the import, and anything below it reads off it.
   */
  flatExportRef(
    spec: string,
    segs: string[],
    prefix: string,
    ctx: Ctx,
    lw: Lowerer,
  ): string | undefined {
    const ex = this.pkgExports(spec);
    for (let i = segs.length - 1; i >= 0; i--)
      if (ex.has(segs[i]))
        return [this.importPkg(spec, segs[i], prefix, ctx, lw), ...segs.slice(i + 1)].join(".");
    return undefined;
  }

  constRef(p: string[], nesting: string[], ctx: Ctx, lw: Lowerer): string {
    let hit = this.index.resolveConst(p, nesting);
    // A test support file reopening a dependency class (`ActiveSupport::TestCase`
    // in `support/job_buffer.rb`) does not make it the gem's own for lib code.
    if (
      hit?.kind === "scope" &&
      !ctx.f.rubyFile.startsWith("test/") &&
      [...(this.index.scopes.get(hit.fqn)?.files ?? [])].every((f) => f.startsWith("test/"))
    )
      hit = undefined;
    if (hit) return this.fqnRef(hit.fqn, ctx, lw);
    const segs = p[0] === "" ? p.slice(1) : p;
    const [root, ...rest] = segs;
    if (root === "Arel") {
      const a = lw.imp(ctx, "@blazetrails/arel", "*", "Arel");
      return [a, ...rest].join(".");
    }
    // A dependency constant trails exports under another name
    // (`ActiveModel::Type::String` is `StringType`): the longest table prefix
    // names the import, and any nested constant reads off it.
    for (let i = segs.length; i > 0; i--) {
      const ref = (p[0] === "" ? "::" : "") + segs.slice(0, i).join("::");
      const key = tsConstantRenameKey(ref, nesting.join("::"));
      if (key === undefined) continue;
      const renamed = TS_CONSTANT_RENAMES[key];
      const spec = DEP_ROOT_PACKAGES[key.split("::")[0]];
      if (spec && this.pkgExports(spec).has(renamed))
        return [this.importPkg(spec, renamed, root, ctx, lw), ...segs.slice(i)].join(".");
    }
    // An activesupport module ported on a subpath of its own, not the package root.
    const AS_SUBPATH: Record<string, [string, string, string]> = {
      "ActiveSupport::TestCase": [
        "@blazetrails/activesupport/test-case",
        "TestCase",
        "ActiveSupportTestCase",
      ],
      "ActiveSupport::LogSubscriber::TestHelper": [
        "@blazetrails/activesupport/log-subscriber/test-helper",
        "TestHelper",
        "LogSubscriberTestHelper",
      ],
    };
    if (AS_SUBPATH[segs.join("::")]) {
      const [spec, name, local] = AS_SUBPATH[segs.join("::")];
      return lw.imp(ctx, spec, name, local);
    }
    if (root === "ActiveSupport" || root === "ActiveModel") {
      const spec =
        root === "ActiveSupport" ? "@blazetrails/activesupport" : "@blazetrails/activemodel";
      const flat = this.flatExportRef(spec, rest, root, ctx, lw);
      if (flat !== undefined) return flat;
      if (this.pkgExports(spec).has(root))
        return [this.importPkg(spec, root, "", ctx, lw), ...rest].join(".");
    }
    const SPECIAL: Record<string, string> = {
      "Float::INFINITY": "Infinity",
      "Float::NAN": "NaN",
      ENV: "process.env",
      Rails: "TopLevel.Trails!",
      "Float::EPSILON": "Number.EPSILON",
    };
    if (SPECIAL[segs.join("::")]) {
      const v = SPECIAL[segs.join("::")];
      if (v.startsWith("TopLevel.")) lw.imp(ctx, "@blazetrails/activesupport", "TopLevel");
      return v;
    }
    // `include ActiveSupport::Logger::Severity` (Ruby stdlib logger/severity.rb)
    // makes `WARN` a lexical constant; trails' Logger carries them as statics.
    if (
      segs.length === 1 &&
      ["DEBUG", "INFO", "WARN", "ERROR", "FATAL", "UNKNOWN"].includes(root) &&
      (ctx.nesting ?? []).some((fqn: string) =>
        this.index.scopes.get(fqn)?.includes.some((p: string[]) =>
          p
            .filter((x) => x)
            .join("::")
            .endsWith("Logger::Severity"),
        ),
      )
    )
      return `${lw.imp(ctx, "@blazetrails/activesupport", "Logger")}.${root}`;
    if (root === "Rails" && rest.length) {
      // CLAUDE.md "Call-time constant resolution": Ruby's top-level Object is
      // TopLevel; the Rails application constant is read at call time.
      lw.imp(ctx, "@blazetrails/activesupport", "TopLevel");
      return ["TopLevel.Trails!", ...rest.map((x) => TS_CLASS_RENAMES[x] ?? x)].join(".");
    }
    // Ruby namespaces that are their own trails packages.
    const NS_PKG: Record<string, string> = {
      DidYouMean: "@blazetrails/did-you-mean",
      GlobalID: "@blazetrails/globalid",
    };
    // The class itself (`GlobalID.app = "aj"`): the package's export of that name.
    if (NS_PKG[root] && !rest.length && this.pkgExports(NS_PKG[root]).has(root))
      return this.importPkg(NS_PKG[root], root, "", ctx, lw);
    if (NS_PKG[root] && rest.length && this.pkgExports(NS_PKG[root]).has(rest[0]))
      return [this.importPkg(NS_PKG[root], rest[0], root, ctx, lw), ...rest.slice(1)].join(".");
    // A namespace a trails package reopens (globalid's `URI::GID`, lib/global_id/uri/gid.rb)
    // is that package's: its members are flat exports there.
    const REOPENED: Record<string, string> = { "URI::GID": "@blazetrails/globalid" };
    for (const [ns, spec] of Object.entries(REOPENED)) {
      const n = ns.split("::").length;
      if (segs.slice(0, n).join("::") !== ns) continue;
      const tail = segs.slice(n);
      const name = tail.length ? tail[0] : segs[n - 1];
      if (this.pkgExports(spec).has(name))
        return [this.importPkg(spec, name, root, ctx, lw), ...tail.slice(1)].join(".");
    }
    if (segs.length > 1) {
      for (const spec of [
        "@blazetrails/ruby-compat",
        "@blazetrails/activesupport",
        "@blazetrails/activemodel",
      ]) {
        if (!this.pkgExports(spec).has(root)) continue;
        const flat = this.flatExportRef(spec, segs, "Rb", ctx, lw);
        if (flat !== undefined) return flat;
        return [this.importPkg(spec, root, "Rb", ctx, lw), ...rest].join(".");
      }
    }
    if (segs.length === 1) {
      if (this.pkgExports("@blazetrails/ruby-compat").has(root))
        return this.importPkg("@blazetrails/ruby-compat", root, "Rb", ctx, lw);
      if (this.pkgExports("@blazetrails/activesupport").has(root))
        return this.importPkg("@blazetrails/activesupport", root, "Rb", ctx, lw);
      if (this.pkgExports("@blazetrails/activemodel").has(root))
        return this.importPkg("@blazetrails/activemodel", root, "Rb", ctx, lw);
      // Ruby core `Time` / `Date` / `DateTime` are `@blazetrails/date`'s ports,
      // imported as `RubyTime` etc. (the hand port's spelling,
      // activerecord type/time.ts) so the JS `Date` global stays reachable.
      if (this.pkgExports("@blazetrails/date").has(root))
        return lw.imp(ctx, "@blazetrails/date", root, `Ruby${root}`);
      if (JS_GLOBALS[root]) return JS_GLOBALS[root];
    }
    // Another framework gem's root (`ActiveRecord` in activejob's
    // `enqueue_after_transaction_commit.rb`) is read off `TopLevel` at call
    // time, as the defining gem seats it (CLAUDE.md, "Call-time constant
    // resolution"): activejob takes no load-order dependency on it. Read as
    // `any`, since `TopLevel`'s type lists only the members trails reads today.
    if (
      FOREIGN_GEM_ROOTS.has(root) &&
      root.toLowerCase() !== (process.env.CODEGEN_GEM ?? "activerecord")
    )
      return [
        `(${lw.imp(ctx, "@blazetrails/activesupport", "TopLevel")} as any).${root}`,
        ...rest,
      ].join(".");
    const key = segs.join("::");
    this.unresolvedConsts.set(key, (this.unresolvedConsts.get(key) ?? 0) + 1);
    return lw.decline(ctx, "const-unresolved", { k: "const", l: undefined } as N, key);
  }

  /** Resolve a call against the gem: self-calls through the owner's ancestors, `Const.m` on gem classes. */
  member(
    n: N,
    recvNode: N | null,
    ctx: Ctx,
    _lw: Lowerer,
  ): { name: string; kind: "method" | "property"; async?: boolean; params?: Param[] } | null {
    const name: string = n.name;
    let scopes: ScopeInfo[];
    let singleton: boolean;
    if (!recvNode || recvNode.k === "self") {
      if (!ctx.owner) return null;
      scopes = this.index.ancestors(ctx.owner);
      singleton = ctx.selfKind === "static";
    } else if (recvNode.k === "const") {
      const hit = this.index.resolveConst(recvNode.path, ctx.nesting);
      if (!hit || hit.kind !== "scope") return null;
      scopes = this.index.ancestors(hit.fqn);
      singleton = true;
    } else if (
      recvNode.k === "call" &&
      recvNode.name === "class" &&
      (recvNode.recv === null || recvNode.recv?.k === "self") &&
      ctx.owner &&
      ctx.selfKind !== "static"
    ) {
      // `self.class.x` is the class side of the owner.
      scopes = this.index.ancestors(ctx.owner);
      singleton = true;
    } else return null;
    for (const s of scopes) {
      const attrs = singleton ? s.sattrs : s.attrs;
      const defs = singleton ? s.sdefs : s.defs;
      if (attrs.has(name)) return { name: propName(name), kind: "property" };
      const d = defs.get(name);
      if (d) {
        return {
          name: tsMethodName(name, s.fqn, singleton),
          kind: "method",
          async: this.asyncDefs.has(`${s.fqn}${singleton ? "." : "#"}${name}`),
          params: d.params,
        };
      }
      if (singleton) {
        // ClassMethods of an extended concern
        const cm = this.index.scopes.get(`${s.fqn}::ClassMethods`);
        const cd = cm?.defs.get(name);
        if (cd)
          return {
            name: tsMethodName(name, cm!.fqn),
            kind: "method",
            async: this.asyncDefs.has(`${cm!.fqn}#${name}`),
          };
      }
    }
    // A module's `self` is whatever includes it, so a bare call can land on a
    // sibling module of the includer (`Execution#perform_now` calls
    // `Core#deserialize_arguments_if_needed`). Answer only an unambiguous name.
    const owner = ctx.owner ? this.index.scopes.get(ctx.owner) : undefined;
    if (owner?.kind === "module" && !singleton && (!recvNode || recvNode.k === "self")) {
      const all = [...this.index.scopes.values()];
      const attr = all.filter((s) => s.kind === "module" && s.attrs.has(name));
      if (attr.length === 1) return { name: propName(name), kind: "property" };
      let hits = all.filter((s) => s.defs.has(name));
      if (hits.length > 1) hits = hits.filter((s) => s.kind === "module");
      if (hits.length === 1) {
        const s = hits[0];
        return {
          name: tsMethodName(name, s.fqn, false),
          kind: "method",
          async: this.asyncDefs.has(`${s.fqn}#${name}`),
          params: s.defs.get(name)!.params,
        };
      }
    }
    return null;
  }

  /**
   * A Ruby module function called on a dependency namespace whose trails port is
   * a package-level function rather than a member of the namespace object
   * (`ActiveSupport.on_load` → `onLoad`, `Array.wrap` → activesupport `wrap`).
   */
  namespaceFunction(p: string[], rubyName: string, ctx: Ctx, lw: Lowerer): string | null {
    const segs = p[0] === "" ? p.slice(1) : p;
    const key = segs.join("::");
    const ts = tsMethodName(rubyName);
    const pkgFor: Record<string, string> = {
      ActiveSupport: "@blazetrails/activesupport",
      ActiveModel: "@blazetrails/activemodel",
      // `ActiveSupport::Inflector`'s module functions are activesupport exports.
      "ActiveSupport::Inflector": "@blazetrails/activesupport",
      Array: "@blazetrails/activesupport",
      Hash: "@blazetrails/activesupport",
    };
    // ActiveSupport's `Time` class-side extensions (core_ext/time/zones.rb) are
    // activesupport functions (`Time.zone` is `zone()`, time-zone-config.ts);
    // the rest of Ruby's `Time` is `@blazetrails/date`'s class.
    if (
      key === "Time" &&
      ["zone", "use_zone", "find_zone", "find_zone!"].includes(rubyName) &&
      !this.index.resolveConst(p, ctx.nesting) &&
      this.pkgExports("@blazetrails/activesupport").has(ts)
    )
      return lw.imp(ctx, "@blazetrails/activesupport", ts);
    const spec = pkgFor[key];
    if (!spec || this.index.resolveConst(p, ctx.nesting)) return null;
    if (key === "Array" && rubyName !== "wrap") return null;
    if (key === "Hash" && rubyName !== "from_xml") return null;
    return this.pkgExports(spec).has(ts) ? lw.imp(ctx, spec, ts) : null;
  }

  private includersMemo?: Map<string, string[]>;
  private extendersMemo?: Map<string, string[]>;

  /** Gem classes that `extend` a module (its `self` is their static side). */
  extenders(fqn: string): string[] {
    if (!this.extendersMemo) {
      const m = new Map<string, string[]>();
      for (const s of this.index.scopes.values()) {
        const chain = lexicalChain(this.index, s.lexicalParent);
        for (const ext of s.extends) {
          const hit = this.index.resolveConst(ext, [...chain, s.fqn]);
          if (hit) m.set(hit.fqn, [...(m.get(hit.fqn) ?? []), s.fqn]);
        }
      }
      this.extendersMemo = m;
    }
    return this.extendersMemo.get(fqn) ?? [];
  }

  /** Gem classes/modules that `include` (or `extend`, for ClassMethods) a module. */
  includers(fqn: string): string[] {
    if (!this.includersMemo) {
      const m = new Map<string, string[]>();
      for (const s of this.index.scopes.values()) {
        const chain = lexicalChain(this.index, s.lexicalParent);
        for (const inc of [...s.includes, ...s.extends]) {
          const hit = this.index.resolveConst(inc, [...chain, s.fqn]);
          if (hit) m.set(hit.fqn, [...(m.get(hit.fqn) ?? []), s.fqn]);
        }
      }
      this.includersMemo = m;
    }
    return this.includersMemo.get(fqn) ?? [];
  }

  /**
   * The type `self` has inside a module body: the module's own oracle class,
   * chained to its unique including class when there is one (so `FinderMethods`
   * sees `Relation`'s members); a `ClassMethods` module is the includer's
   * static side.
   */
  moduleSelf(fqn: string): { key: string; static: boolean } | undefined {
    const own = this.oracleKey(fqn);
    let hostFqn: string | undefined;
    let isStatic = false;
    if (fqn.endsWith("::ClassMethods")) {
      const concern = fqn.slice(0, -"::ClassMethods".length);
      const inc = this.includers(concern);
      if (inc.length === 1) {
        hostFqn = inc[0];
        isStatic = true;
      }
    } else {
      const ext = this.extenders(fqn).filter((f) => this.index.scopes.get(f)?.kind === "class");
      const inc = this.includers(fqn).filter(
        (f) => this.index.scopes.get(f)?.kind === "class" && !ext.includes(f),
      );
      if (inc.length === 1 && !ext.length) hostFqn = inc[0];
      else if (ext.length === 1 && !inc.length) {
        hostFqn = ext[0];
        isStatic = true;
      }
    }
    const hostKey = hostFqn ? this.oracleKey(hostFqn) : undefined;
    if (own && hostKey && !isStatic) {
      const c = this.types.cls(own)!;
      let tail = c;
      const seen = new Set<string>();
      while (tail.extends && this.types.cls(tail.extends) && !seen.has(tail.extends)) {
        seen.add(tail.extends);
        tail = this.types.cls(tail.extends)!;
      }
      if (tail.key !== hostKey && !tail.extends) tail.extends = hostKey;
      return { key: own, static: false };
    }
    if (hostKey) return { key: hostKey, static: isStatic };
    return own ? { key: own, static: false } : undefined;
  }

  /** Oracle key (`tsFile#Name`) of a gem class/module, when the hand port has it. */
  oracleKey(fqn: string): string | undefined {
    const e = this.exportNames.get(fqn);
    if (!e) return undefined;
    const key = `${e.tsFile}#${e.name}`;
    if (this.types.cls(key)) {
      // A module object whose own members the checker could not see (built with
      // `new Module(…)`): chain to the file's functions.
      const c = this.types.cls(key)!;
      if (
        this.index.scopes.get(fqn)?.kind === "module" &&
        this.types.cls(`${e.tsFile}#*`) &&
        !c.extends
      )
        c.extends = `${e.tsFile}#*`;
      return key;
    }
    if (this.index.scopes.get(fqn)?.kind === "module" && this.types.cls(`${e.tsFile}#*`))
      return `${e.tsFile}#*`;
    return undefined;
  }

  /** Type of a constant reference: a gem class (static side) or a dependency class. */
  constType(p: string[] | null, nesting: string[]): TypeRef {
    if (!p) return null;
    const hit = this.index.resolveConst(p, nesting);
    if (hit?.kind === "scope") {
      const k = this.oracleKey(hit.fqn);
      return k ? { k: "class", key: k, static: true } : null;
    }
    if (hit) return null;
    const segs = p[0] === "" ? p.slice(1) : p;
    const k = this.types.depClass(segs);
    return k ? { k: "class", key: k, static: true } : null;
  }

  /**
   * Members the `TopLevel.Trails` seat declares (activesupport `namespaces.ts`):
   * whether each is a method, and whether its type admits `null`. A Rails module
   * reader trailties ports as a property (`Trails.env`) is read without a call.
   */
  get trailsSeat(): Map<string, { method: boolean; nullable: boolean }> {
    if (this._trailsSeat) return this._trailsSeat;
    const src = readFileSync(path.join(ROOT, "packages/activesupport/src/namespaces.ts"), "utf8");
    const body = /\n {2}Trails\?: \{\n([\s\S]*?)\n {2}\};/.exec(src)?.[1];
    if (body === undefined)
      throw new Error("namespaces.ts: no `Trails?: { … };` seat type to read");
    const seat = new Map<string, { method: boolean; nullable: boolean }>();
    let cur: { name: string; method: boolean; text: string } | undefined;
    let depth = 0;
    for (const line of body.split("\n")) {
      const m = depth === 0 ? /^ {4}(\w+)\??(\(|:)/.exec(line) : null;
      if (m) cur = { name: m[1], method: m[2] === "(", text: "" };
      if (!cur) continue;
      cur.text += line;
      depth += (line.match(/[{(]/g) ?? []).length - (line.match(/[})]/g) ?? []).length;
      if (depth === 0 && /;\s*$/.test(line)) {
        seat.set(cur.name, { method: cur.method, nullable: /\|\s*null\s*;\s*$/.test(cur.text) });
        cur = undefined;
      }
    }
    if (!seat.has("env") || cur !== undefined)
      throw new Error("namespaces.ts: the `Trails` seat type did not parse member by member");
    return (this._trailsSeat = seat);
  }
  private _trailsSeat?: Map<string, { method: boolean; nullable: boolean }>;

  isProperty(rubyName: string): boolean {
    return this.types.onlyPropertyOnDeps(propName(rubyName));
  }

  /** The receiver is self or a gem constant, so Ruby-core lowering must not apply. */
  isGemReceiver(recvNode: N, ctx: Ctx, _lw: Lowerer): boolean {
    if (recvNode.k === "self") return true;
    if (recvNode.k === "const") {
      const hit = this.index.resolveConst(recvNode.path, ctx.nesting);
      // A constant holding a Hash / Array literal is data: core calls apply.
      if (hit && hit.kind !== "scope" && this.index.consts.get(hit.fqn)?.literal) return false;
      return !!hit;
    }
    return false;
  }

  chain(fqn: string | undefined): string[] {
    return lexicalChain(this.index, fqn);
  }
}

/** Ruby file (relative to the gem's lib) → TS file (relative to packages/<gem>/src). */
export function rubyFileToTsAr(rubyFile: string): string {
  // Ported tests (`--tests`): `test/cases/callbacks_test.rb` is `callbacks.test.ts`,
  // the path test-compare maps it to; `test/jobs/callback_job.rb` and the other
  // fixture directories live under `test-helpers/` (the canonical-fixture home).
  if (rubyFile.startsWith("test/")) {
    const rel = rubyFile.slice("test/".length).replace(/\.rb$/, "");
    const kebab = (p: string) =>
      p
        .split("/")
        .map((x) => x.replace(/_/g, "-"))
        .join("/");
    if (rel.startsWith("cases/"))
      return `${kebab(rel.slice("cases/".length)).replace(/-test$/, "")}.test.ts`;
    // A test outside `cases/` (`test/serializers/time_with_zone_serializer_test.rb`)
    // sits beside the lib file it tests.
    if (rel.endsWith("_test")) return `${kebab(rel).replace(/-test$/, "")}.test.ts`;
    return `test-helpers/${kebab(rel)}.ts`;
  }
  const root = GEM.rubyRoot;
  const rel = rubyFile === `${root}.rb` ? rubyFile : rubyFile.replace(new RegExp(`^${root}/`), "");
  return rubyFileToTs(rel, GEM.gem);
}
