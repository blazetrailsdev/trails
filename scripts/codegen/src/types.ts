/**
 * Receiver typing over the hand oracle (pass 5's type half).
 *
 * A Ruby expression's type is derived, flow-insensitively, from what the IR
 * states plus the oracle: `self` is the owner class, `@x` is the owner's `_x` /
 * `x` member, a constant is its class (static side), `X.new` an instance, a
 * local the type of its first typed assignment, and a call the declared return
 * type of the member it resolves to. Anything else is unknown, and an unknown
 * receiver gets no member lookup and no `await` — never a name-keyed guess.
 */
import { readFileSync } from "node:fs";
import { rubyMethodToTsIgnoringSkip } from "../../parity/conventions.js";
import type { N } from "./ir.js";
import type { ClassInfo, MemberInfo, Oracle, TypeRef } from "./hand-oracle.js";

export interface Resolved {
  tsName: string;
  info: MemberInfo;
  owner: string;
}

export class TypeOracle {
  readonly o: Oracle;
  /** short class name → keys (dependency classes, for constant typing) */
  private byShort = new Map<string, string[]>();
  hits = 0;
  missLog = new Map<string, number>();
  misses = 0;

  constructor(file: string) {
    this.o = JSON.parse(readFileSync(file, "utf8")) as Oracle;
    // A file's exported functions double as the members of the module it
    // ports (`export async function save(this: …)` beside `new Module(…)`).
    for (const [f, fns] of Object.entries(this.o.functions)) {
      this.o.classes[`${f}#*`] = { key: `${f}#*`, instance: fns, static: fns };
    }
    for (const key of Object.keys(this.o.classes)) {
      const short = key.slice(key.lastIndexOf("#") + 1);
      const l = this.byShort.get(short) ?? [];
      l.push(key);
      this.byShort.set(short, l);
    }
  }

  private propertyMemo?: Map<string, boolean>;
  /**
   * Whether every dependency class (`@pkg/…` key) that declares instance member
   * `tsName` declares it as a getter or property, and at least one does.
   */
  /**
   * Whether the hand port's own classes (not `@pkg/…` dependencies) define
   * instance member `tsName` at all: an untyped call of a name the hand port
   * knows is left to the hand port's typing, not guessed from gem methods.
   */
  handDefines(tsName: string): boolean {
    for (const [k, c] of Object.entries(this.o.classes))
      if (!k.startsWith("@") && c.instance?.[tsName]) return true;
    return false;
  }

  onlyPropertyOnDeps(tsName: string): boolean {
    if (!this.propertyMemo) {
      const kinds = new Map<string, Set<string>>();
      for (const [k, c] of Object.entries(this.o.classes)) {
        if (!k.startsWith("@")) continue;
        for (const [n, info] of Object.entries(c.instance ?? {})) {
          if (!kinds.has(n)) kinds.set(n, new Set());
          kinds.get(n)!.add(info.kind);
        }
      }
      this.propertyMemo = new Map(
        [...kinds].map(([n, ks]) => [
          n,
          [...ks].every((x) => x === "get" || x === "prop" || x === "property"),
        ]),
      );
    }
    return this.propertyMemo.get(tsName) ?? false;
  }

  cls(key: string): ClassInfo | undefined {
    return this.o.classes[key];
  }

  /** Dependency class by its Ruby constant path (`Arel::Nodes::Grouping`). */
  depClass(path: string[]): string | undefined {
    const short = path[path.length - 1];
    const cands = (this.byShort.get(short) ?? []).filter((k) => k.startsWith("@"));
    if (cands.length === 1) return cands[0];
    const pkg =
      path[0] === "Arel"
        ? "@arel/"
        : path[0] === "ActiveModel"
          ? "@activemodel/"
          : path[0] === "ActiveSupport"
            ? "@activesupport/"
            : null;
    const narrowed = pkg ? cands.filter((k) => k.startsWith(pkg)) : cands;
    return narrowed.length === 1 ? narrowed[0] : undefined;
  }

  /**
   * Find the member a Ruby call names on a class (walking `extends`), trying the
   * conventions candidates in order, so the result carries the hand port's own
   * spelling of it.
   */
  member(key: string, rubyName: string, isStatic: boolean): Resolved | undefined {
    const cands = candidates(rubyName);
    const seen = new Set<string>();
    for (let k: string | undefined = key; k && !seen.has(k); k = this.o.classes[k]?.extends) {
      seen.add(k);
      const c = this.o.classes[k];
      if (!c) break;
      const bag = isStatic ? c.static : c.instance;
      for (const n of cands) {
        if (Object.hasOwn(bag, n)) {
          this.hits++;
          return { tsName: n, info: bag[n], owner: k };
        }
      }
    }
    this.misses++;
    const mk = `${key.replace(/#.*$/, "").replace(/^.*\//, "")}#${key.slice(key.indexOf("#") + 1)} ${rubyName}`;
    this.missLog.set(mk, (this.missLog.get(mk) ?? 0) + 1);
    return undefined;
  }

  /** The type of an ivar slot on the owner class: `_x`, then `x`. */
  ivar(key: string, rubyIvar: string): TypeRef {
    const base = camel(rubyIvar.replace(/^@/, ""));
    for (const n of [`_${base}`, base, `#${base}`]) {
      const seen = new Set<string>();
      for (let k: string | undefined = key; k && !seen.has(k); k = this.o.classes[k]?.extends) {
        seen.add(k);
        const m = this.o.classes[k]?.instance[n];
        if (m) return m.ret;
      }
    }
    return null;
  }
}

export function candidates(rubyName: string): string[] {
  const c = rubyMethodToTsIgnoringSkip(rubyName) ?? [];
  if (rubyName === "initialize") return ["constructor"];
  if (rubyName.endsWith("=") && !/[=!<>]=$/.test(rubyName)) {
    const b = camel(rubyName.slice(0, -1));
    return [...new Set(["set" + b[0].toUpperCase() + b.slice(1), b, ...c])];
  }
  return c.length ? c : [camel(rubyName.replace(/[?!]$/, ""))];
}

function camel(s: string): string {
  const lead = s.match(/^_+/)?.[0] ?? "";
  return lead + s.slice(lead.length).replace(/_+([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

export function isBool(t: TypeRef): boolean {
  return t?.k === "prim" && t.name === "boolean";
}

/** An object type (class instance, array, function): Ruby-truthy iff non-nil. */
export function isObjectLike(t: TypeRef): boolean {
  return t?.k === "class" || t?.k === "array" || t?.k === "fn" || t?.k === "hash";
}

export type { TypeRef, N };
