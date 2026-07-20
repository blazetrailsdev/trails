import { Node } from "../nodes/node.js";
import { UnsupportedVisitError } from "../errors.js";
import { rubyClassName } from "./ruby-class.js";

// Rails interpolates `object.class` straight into its "Cannot visit" TypeError
// (visitor.rb:38). The nearest handle here is the Ruby class the value would
// have had, falling back to the JS constructor for a real class.
function describeClass(object: unknown): string {
  const rubyClass = rubyClassName(object);
  if (rubyClass !== null) return rubyClass;
  return (object as { constructor?: { name?: string } })?.constructor?.name ?? typeof object;
}

/**
 * Opaque dispatch-cache key for a Node subclass.
 *
 * The parameter list is `never[]` (not `unknown[]`) because the dispatch
 * cache never constructs nodes — the ctor is used purely as a Map key. TS
 * is contravariant in constructor parameter types, so `never[]` is the
 * only signature that accepts ctors of arbitrary arity (e.g.
 * `Binary(left, right)`, `BoundSqlLiteral(sql, binds)`). `unknown[]` would
 * reject any ctor with a more-specific parameter type.
 */
export type NodeCtor = abstract new (...args: never[]) => Node;
type VisitorCtor = typeof Visitor;

const PER_CLASS_CACHE = new WeakMap<VisitorCtor, Map<NodeCtor, string>>();

/**
 * Base visitor with class-tagged dispatch.
 *
 * Mirrors: Arel::Visitors::Visitor (activerecord/lib/arel/visitors/visitor.rb).
 *
 * Ruby uses `__send__("visit_#{klass.name.gsub('::','_')}")` keyed by the
 * runtime class. We can't use string-named methods cleanly in TS without
 * losing typecheck, so we keep camelCase method names and route through an
 * explicit dispatch table: each `Visitor` subclass populates its own
 * `dispatchCache` (a `Map<NodeCtor, methodName>`), and `visit` looks up the
 * runtime constructor, falling back to the prototype chain (mirroring
 * Ruby's `klass.ancestors` walk).
 *
 * Raw JS values reach the same method table. Ruby has a class for every
 * object, so `visit(1)` is `visit_Integer` and `visit("x")` is `visit_String`
 * (which aliases to `unsupported` and raises, to_sql.rb:842) — there is no
 * separate entry point for values. A JS primitive has no such class, so
 * `rubyClassName` names the Ruby class it would have had and `visit` resolves
 * that to the matching `visit<Name>` method.
 */
export abstract class Visitor {
  protected dispatch: Map<NodeCtor, string>;

  constructor() {
    this.dispatch = this.getDispatchCache();
  }

  accept<C>(object: unknown, collector: C): C;
  accept(object: unknown): unknown;
  accept(object: unknown, collector?: unknown): unknown {
    return this.visit(object, collector);
  }

  /**
   * Instance-side accessor mirroring Rails' private `get_dispatch_cache`.
   * Returns the class-level dispatch cache for `this.constructor`.
   */
  protected getDispatchCache(): Map<NodeCtor, string> {
    return (this.constructor as VisitorCtor).dispatchCache();
  }

  protected visit<C>(object: unknown, collector: C): C;
  protected visit(object: unknown): unknown;
  protected visit(object: unknown, collector?: unknown): unknown {
    const methodName = this.dispatchMethod(object);
    if (!methodName) {
      // Rails' second failure terminal: no handler on the class or any of its
      // ancestors falls out of `rescue NoMethodError` as a TypeError
      // (visitor.rb:38), distinct from a class whose handler is aliased to
      // `unsupported` and raises UnsupportedVisitError (to_sql.rb:828).
      throw new TypeError(`Cannot visit ${describeClass(object)}`);
    }
    const fn = (this as unknown as Record<string, unknown>)[methodName];
    if (typeof fn !== "function") {
      // Cache hit but the instance has no such method — almost always a
      // mis-registration (a typo'd method name landed in the dispatch
      // cache). This is a visitor bug, not an unvisitable value, so it is
      // a plain Error rather than an UnsupportedVisitError (matching the
      // same check in to-sql.ts:479). Subclasses that translate the
      // "no entry at all" case into their own error — Dot re-raises it as
      // Rails' `TypeError, "Cannot visit ..."` (visitor.rb:39) — must not
      // swallow this one, or a typo'd registration masquerades as an
      // unvisitable value.
      throw new Error(
        `Dispatch method '${methodName}' is not defined on ${this.constructor.name} for node ${describeClass(object)}`,
      );
    }
    return (fn as (n: unknown, c?: unknown) => unknown).call(this, object, collector);
  }

  /**
   * Per-class dispatch cache. Each subclass gets its own map seeded from
   * its parent (mirrors Rails' `@dispatch_cache ||= ...` per-class ivar).
   *
   * @internal
   */
  static dispatchCache(this: VisitorCtor): Map<NodeCtor, string> {
    let cache = PER_CLASS_CACHE.get(this);
    if (!cache) {
      const parent = Object.getPrototypeOf(this) as VisitorCtor | null;
      const inherited =
        parent && typeof parent.dispatchCache === "function" && parent !== this
          ? parent.dispatchCache()
          : undefined;
      cache = new Map(inherited);
      PER_CLASS_CACHE.set(this, cache);
    }
    return cache;
  }

  /**
   * The dispatch method name for `object`, mirroring `dispatch[object.class]`
   * (visitor.rb:29). Rails reads one runtime class off every object it visits,
   * nodes and raw values alike; TS has no single such handle, so a real class
   * resolves through the constructor-keyed cache and a raw JS value resolves
   * through `rubyClassName` — the name of the Ruby class it would have had.
   * Both arrive at the same `visit<Name>` method table, so there is no second
   * entry point for raw values.
   */
  private dispatchMethod(object: unknown): string | undefined {
    const ctor = (object as { constructor?: NodeCtor } | null | undefined)?.constructor;
    if (ctor) {
      const byCtor = this.resolveDispatch(ctor);
      if (byCtor) return byCtor;
    }
    const rubyClass = rubyClassName(object);
    return rubyClass === null ? undefined : `visit${rubyClass}`;
  }

  /**
   * Resolve the dispatch method name for `ctor`, walking the JS prototype
   * chain to find an ancestor's handler when there is no direct entry.
   * Mirrors Ruby's `klass.ancestors.find { |k| respond_to?(dispatch[k]) }`.
   * Successful lookups are memoized into the cache, matching Rails.
   */
  private resolveDispatch(ctor: NodeCtor): string | undefined {
    const direct = this.dispatch.get(ctor);
    if (direct) return direct;
    let cur: NodeCtor | null = ctor;
    while (cur) {
      const proto = Object.getPrototypeOf(cur.prototype) as object | null;
      const parent = proto?.constructor as NodeCtor | undefined;
      if (!parent || (parent as unknown) === Object) return undefined;
      const found = this.dispatch.get(parent);
      if (found) {
        this.dispatch.set(ctor, found);
        return found;
      }
      cur = parent;
    }
    return undefined;
  }
}
