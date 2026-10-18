/* eslint-disable @typescript-eslint/no-explicit-any -- the IR is untyped JSON from the Ruby front-end */
/**
 * Pass 2: the gem index. Every class, module, def, attr and constant in the
 * whole gem, recorded before any body is lowered, so a constant or self-call
 * resolves no matter which file it is defined in.
 */
import { GEM } from "./gem.js";
import type { IrFile, N } from "./ir.js";

export interface DefInfo {
  name: string;
  singleton: boolean;
  arity: number;
  params: any[];
  file: string;
  line: number;
  /** Last line of the `def` (Prism's end offset), for an `@inlinedFrom` citation. */
  lineEnd?: number;
  /** The `def` node itself, for inlining a module's `initialize` into a constructor. */
  node?: any;
}

export interface ScopeInfo {
  fqn: string;
  kind: "class" | "module";
  files: Set<string>;
  /** Ruby file whose path best matches the fqn — where the type is imported from. */
  primaryFile?: string;
  superclassPath?: string[];
  /** Any `class X < expr`, including a non-constant superclass (`DelegateClass(...)`). */
  hasSuperclass?: boolean;
  superclassFqn?: string;
  defs: Map<string, DefInfo>;
  sdefs: Map<string, DefInfo>;
  attrs: Set<string>;
  sattrs: Set<string>;
  /** `singleton_class.attr_accessor` names: module functions, written through `setX`. */
  sclassAttrs: Set<string>;
  includes: string[][];
  /** `prepend`ed module paths: also in `includes` for method lookup, but ahead of the class in Ruby's ancestors. */
  prepends: string[][];
  extends: string[][];
  consts: Set<string>;
  concern: boolean;
  /** Short TS name it is exported as from `primaryFile`'s TS twin. */
  exportName?: string;
  lexicalParent?: string;
}

export interface ConstInfo {
  fqn: string;
  file: string;
  /** The value is a Hash / Array literal (possibly `.freeze`d): data, not a gem object. */
  literal?: "hash" | "array";
}

/** A dependency module's `initialize`, as read from the Rails manifest and its file's IR. */
export interface DepInitHook {
  node: any;
  /** `rails/v8.0.2/<gem>/lib/<file>:<first>-<last>`, the manifest's citation. */
  cite: string;
}

export class GemIndex {
  scopes = new Map<string, ScopeInfo>();
  /**
   * Modules outside the gem a class includes, by fqn: their `initialize`, or
   * null when the Rails manifest records none (the module is transparent to a
   * constructor's `super`). A module the manifest does not know is absent.
   */
  depInits = new Map<string, DepInitHook | null>();
  /**
   * Methods of other gems (Rails manifest) that take `*rest` and a block, by
   * Ruby name: JS cannot tell a trailing block from one more rest element, so a
   * call hands it branded with ruby-compat `block()`.
   */
  depRestBlock = new Set<string>();
  /** Gem methods taking `*rest` and a `&block`: a call's block is branded so the callee can tell it from a positional. */
  gemRestBlock = new Set<string>();
  /** Instance writers any gem scope declares (`attr_writer :priority` in Core). */
  instanceWriters = new Set<string>();
  /** `x?` predicates `class_attribute` defines: activesupport ports each as a getter. */
  classAttrPredicates = new Set<string>();
  /** Constants a module declares with `autoload :X` (Ruby loads them on first read), as `Mod::X`. */
  autoloads = new Set<string>();
  /** Ruby files that `require` a library outside trails and Ruby's stdlib. */
  externalFiles = new Set<string>();
  /** Classes whose `initialize` reads `$!`: their constructor takes `errinfo`. */
  errinfoCtors = new Set<string>();
  /** Top-level `def`s of a ported test support file (helper.rb's `adapter_is?`), by Ruby name → TS file. */
  topDefs = new Map<string, string>();
  consts = new Map<string, ConstInfo>();
  /** Constant aliases of classes/modules, resolved in finish(). */
  aliasPaths = new Map<string, { path: string[]; nesting: string[] }>();
  aliases = new Map<string, string>();

  /** Every method name defined anywhere in the gem → whether it is only an attr. */
  /** `testZero`: zero-argument-callable defs in a test helper module (`test_helper.rb`), only ever sent to a test's `self`. */
  methodNames = new Map<
    string,
    { def: number; attr: number; zeroArity: number; testZero?: number }
  >();

  scope(fqn: string, kind: "class" | "module"): ScopeInfo {
    let s = this.scopes.get(fqn);
    if (!s) {
      s = {
        fqn,
        kind,
        files: new Set(),
        defs: new Map(),
        sdefs: new Map(),
        attrs: new Set(),
        sattrs: new Set(),
        sclassAttrs: new Set(),
        includes: [],
        prepends: [],
        extends: [],
        consts: new Set(),
        concern: false,
      };
      this.scopes.set(fqn, s);
    }
    if (kind === "class") s.kind = "class";
    return s;
  }

  noteMethod(name: string, kind: "def" | "attr", arity = -1, file = ""): void {
    let m = this.methodNames.get(name);
    if (!m) this.methodNames.set(name, (m = { def: 0, attr: 0, zeroArity: 0 }));
    m[kind]++;
    if (kind === "def" && arity === 0) m.zeroArity++;
    if (kind === "def" && arity === 0 && /test_helper\.rb$/.test(file))
      m.testZero = (m.testZero ?? 0) + 1;
  }

  add(file: IrFile): void {
    this.visit(file.body, [], file.file, false);
  }

  private visit(node: N, nesting: string[], file: string, singleton: boolean): void {
    if (!node) return;
    if (node.k === "seq") {
      for (const s of node.body) this.visit(s, nesting, file, singleton);
      return;
    }
    const cur = nesting[nesting.length - 1];
    if (node.k === "module" || node.k === "class") {
      if (!node.path) return;
      const fqn = qualify(node.path, cur);
      const s = this.scope(fqn, node.k);
      s.files.add(file);
      s.lexicalParent ??= cur;
      if (node.k === "class" && node.superclass) s.hasSuperclass = true;
      if (node.k === "class" && node.superclass?.k === "const")
        s.superclassPath ??= node.superclass.path;
      this.visit(node.body, [...nesting, fqn], file, false);
      return;
    }
    if (node.k === "sclass") {
      this.visit(node.body, nesting, file, true);
      return;
    }
    if (!cur) return;
    const s = this.scopes.get(cur)!;
    if (
      node.k === "call" &&
      node.recv === null &&
      node.name === "autoload" &&
      node.args?.[0]?.k === "sym"
    ) {
      this.autoloads.add(`${cur}::${node.args[0].value}`);
      return;
    }
    if (
      node.k === "call" &&
      node.recv === null &&
      node.name === "eager_autoload" &&
      node.block?.k === "block"
    ) {
      this.visit(node.block.body, nesting, file, singleton);
      return;
    }
    if (node.k === "def") {
      const info: DefInfo = {
        name: node.name,
        singleton: singleton || node.singleton,
        arity: node.params.filter((p: any) => p.kind === "req").length,
        params: node.params,
        file,
        line: node.l ?? 0,
        lineEnd: node.lend,
        node,
      };
      (info.singleton ? s.sdefs : s.defs).set(node.name, info);
      // `zeroArity` counts the defs a zero-argument call can reach: no required parameter.
      if (
        // `...` forwards the block too; counted for activejob only, where a test
        // block reaches `perform_later(...)` (activerecord's arg comparison skips a
        // branded block, so its 159 `...` call sites would drop out of the measure).
        node.params.some(
          (p: any) =>
            p.kind === "rest" || (p.kind === "fwd" && process.env.CODEGEN_GEM === "activejob"),
        ) &&
        (node.params.some((p: any) => p.kind === "block") ||
          /"k":"yield"|"name":"block_given\?"/.test(JSON.stringify(node.body ?? null)))
      )
        this.gemRestBlock.add(node.name);
      this.noteMethod(
        node.name,
        "def",
        node.params.filter((p: any) => p.kind === "req").length,
        file,
      );
      return;
    }
    if (node.k === "casgn" && node.path?.length === 1) {
      s.consts.add(node.path[0]);
      const v =
        node.value?.k === "call" && node.value.name === "freeze" ? node.value.recv : node.value;
      const literal = v?.k === "hash" ? "hash" : v?.k === "array" ? "array" : undefined;
      this.consts.set(`${cur}::${node.path[0]}`, { fqn: `${cur}::${node.path[0]}`, file, literal });
      // `OID = PostgreSQL::OID` — a constant naming a module is an alias of it.
      if (node.value?.k === "const")
        this.aliasPaths.set(`${cur}::${node.path[0]}`, {
          path: node.value.path,
          nesting: [...nesting],
        });
      return;
    }
    if (
      node.k === "call" &&
      node.recv?.k === "call" &&
      node.recv.name === "singleton_class" &&
      node.recv.recv === null &&
      /^(attr_reader|attr_accessor|attr_writer|attr)$/.test(node.name)
    ) {
      for (const a of node.args.filter((x: N) => x.k === "sym")) {
        s.sattrs.add(a.value);
        s.sclassAttrs.add(a.value);
      }
      return;
    }
    if (node.k === "call" && node.recv === null) {
      const name = node.name;
      const syms = node.args.filter((a: N) => a.k === "sym").map((a: N) => a.value);
      if (/^(attr_reader|attr_accessor|attr_writer|attr)$/.test(name)) {
        for (const a of syms) {
          (singleton ? s.sattrs : s.attrs).add(a);
          this.noteMethod(a, "attr");
          if (!singleton && (name === "attr_writer" || name === "attr_accessor"))
            this.instanceWriters.add(a);
        }
      } else if (name === "delegate" && !singleton) {
        // `delegate :x, :x=, to: :t` (TestHelper's `enqueued_jobs`) is an attribute:
        // read as a property, written through `setX`.
        for (const a of syms)
          if (syms.includes(`${a}=`)) {
            s.attrs.add(a);
            this.instanceWriters.add(a);
          }
      } else if (/^(mattr|cattr)_(reader|writer|accessor)$|^class_attribute$/.test(name)) {
        // activesupport ports these as accessor properties: one on the module or
        // class, and one on the instance side unless the options turn it off.
        const opts = node.args.find((a: N) => a.k === "kwargs");
        const off = (k: string) =>
          opts?.pairs.some((p: any) => p.key?.value === k && p.value?.k === "false");
        const instance = !off("instance_reader") && !off("instance_accessor");
        for (const a of syms) {
          s.sattrs.add(a);
          if (instance) s.attrs.add(a);
          this.noteMethod(a, "attr");
          if (name === "class_attribute" && !off("instance_predicate"))
            this.classAttrPredicates.add(`${a}?`);
        }
      } else if (name === "include" || name === "prepend") {
        for (const a of node.args) if (a.k === "const") s.includes.push(a.path);
        if (name === "prepend")
          for (const a of node.args) if (a.k === "const") s.prepends.push(a.path);
      } else if (name === "extend") {
        for (const a of node.args) {
          if (a.k !== "const") continue;
          if (a.path.join("::").endsWith("ActiveSupport::Concern")) s.concern = true;
          else s.extends.push(a.path);
        }
      } else if (
        name === "private" ||
        name === "protected" ||
        name === "public" ||
        name === "module_function"
      ) {
        for (const a of node.args) if (a.k === "def") this.visit(a, nesting, file, singleton);
      } else if ((name === "included" || name === "prepended") && node.block?.k === "block") {
        // An `included do` block runs on the includer: its `class_attribute` /
        // `attr_*` / `delegate`s answer through this module in the ancestors.
        this.visit(node.block.body, nesting, file, singleton);
      } else if (name === "class_methods" && node.block?.k === "block") {
        const cm = this.scope(`${cur}::ClassMethods`, "module");
        cm.files.add(file);
        this.visit(node.block.body, [...nesting, `${cur}::ClassMethods`], file, false);
      }
    }
  }

  finish(rubyFileToTs: (f: string) => string): void {
    for (const s of this.scopes.values()) {
      const files = [...s.files];
      const want = underscore(s.fqn.replace(new RegExp(`^${GEM.namespace}::`), "")) + ".rb";
      s.primaryFile =
        files.find((f) => f.endsWith(want)) ??
        files.find((f) => s.fqn.split("::").every((seg) => f.includes(underscore(seg)))) ??
        files.sort((a, b) => a.length - b.length)[0];
      if (s.superclassPath)
        s.superclassFqn = this.resolveConst(
          s.superclassPath,
          lexicalChain(this, s.lexicalParent),
        )?.fqn;
    }
    for (const [fqn, a] of this.aliasPaths) {
      const hit = this.resolveConst(a.path, a.nesting);
      if (hit?.kind === "scope") this.aliases.set(fqn, hit.fqn);
    }
    void rubyFileToTs;
  }

  /**
   * Ruby constant lookup: lexical scopes innermost-first, then the ancestors of
   * the innermost class, then top level. Returns the fqn when it is defined in
   * the gem.
   */
  resolveConst(
    path: string[] | null,
    nesting: string[],
  ): { fqn: string; kind: "scope" | "const" } | undefined {
    if (!path) return undefined;
    if (path[0] === "") return this.lookup(path.slice(1).join("::"));
    const tail = path.join("::");
    for (let i = nesting.length - 1; i >= 0; i--) {
      const hit = this.lookup(`${nesting[i]}::${tail}`);
      if (hit) return hit;
    }
    const inner = nesting[nesting.length - 1];
    const seen = new Set<string>();
    let anc = inner ? this.scopes.get(inner) : undefined;
    while (anc && !seen.has(anc.fqn)) {
      seen.add(anc.fqn);
      for (const inc of [...anc.includes]) {
        const incFqn = this.resolveConstShallow(inc, nesting);
        if (incFqn) {
          const hit = this.lookup(`${incFqn}::${tail}`);
          if (hit) return hit;
        }
      }
      if (!anc.superclassFqn) break;
      const hit = this.lookup(`${anc.superclassFqn}::${tail}`);
      if (hit) return hit;
      anc = this.scopes.get(anc.superclassFqn);
    }
    return this.lookup(tail);
  }

  private resolveConstShallow(path: string[], nesting: string[]): string | undefined {
    const tail = path.join("::");
    for (let i = nesting.length - 1; i >= 0; i--) {
      if (this.scopes.has(`${nesting[i]}::${tail}`)) return `${nesting[i]}::${tail}`;
    }
    return this.scopes.has(tail) ? tail : undefined;
  }

  private lookup(fqn: string): { fqn: string; kind: "scope" | "const" } | undefined {
    // Follow a constant alias in the leading segments (`…Adapter::OID::Bit`).
    if (this.aliases.size) {
      const segs = fqn.split("::");
      for (let i = segs.length; i > 0; i--) {
        const target = this.aliases.get(segs.slice(0, i).join("::"));
        if (!target) continue;
        const rest = segs.slice(i).join("::");
        const real = rest ? `${target}::${rest}` : target;
        if (this.scopes.has(real)) return { fqn: real, kind: "scope" };
        if (this.consts.has(real)) return { fqn: real, kind: "const" };
      }
    }
    if (this.scopes.has(fqn)) return { fqn, kind: "scope" };
    if (this.consts.has(fqn)) return { fqn, kind: "const" };
    return undefined;
  }

  /** Ancestor chain of a class/module fqn, self first (superclasses and includes). */
  ancestors(fqn: string): ScopeInfo[] {
    const out: ScopeInfo[] = [];
    const seen = new Set<string>();
    const visit = (f: string | undefined) => {
      if (!f || seen.has(f)) return;
      seen.add(f);
      const s = this.scopes.get(f);
      if (!s) return;
      out.push(s);
      const chain = lexicalChain(this, s.lexicalParent);
      for (const inc of s.includes) visit(this.resolveConst(inc, [...chain, f])?.fqn);
      visit(s.superclassFqn);
    };
    visit(fqn);
    return out;
  }
}

export function lexicalChain(index: GemIndex, fqn: string | undefined): string[] {
  const out: string[] = [];
  let cur = fqn;
  while (cur) {
    out.unshift(cur);
    cur = index.scopes.get(cur)?.lexicalParent;
  }
  return out;
}

export function qualify(path: string[], cur: string | undefined): string {
  if (path[0] === "") return path.slice(1).join("::");
  return cur ? `${cur}::${path.join("::")}` : path.join("::");
}

export function underscore(s: string): string {
  return s
    .split("::")
    .map((seg) =>
      seg
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
        .replace(/([a-z\d])([A-Z])/g, "$1_$2")
        .toLowerCase(),
    )
    .join("/");
}
