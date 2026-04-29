import { Node } from "../nodes/node.js";
import { UnsupportedVisitError } from "../errors.js";

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
 */
export abstract class Visitor {
  protected dispatch: Map<NodeCtor, string>;

  constructor() {
    this.dispatch = this.getDispatchCache();
  }

  accept(object: Node, collector?: unknown): unknown {
    return this.visit(object, collector);
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
   * Instance-side accessor mirroring Rails' private `get_dispatch_cache`.
   * Returns the class-level dispatch cache for `this.constructor`.
   */
  protected getDispatchCache(): Map<NodeCtor, string> {
    return (this.constructor as VisitorCtor).dispatchCache();
  }

  protected visit(object: Node, collector?: unknown): unknown {
    const ctor = object.constructor as NodeCtor;
    const methodName = this.resolveDispatch(ctor);
    if (!methodName) {
      throw new UnsupportedVisitError(`Unknown node type: ${ctor.name}`);
    }
    const fn = (this as unknown as Record<string, unknown>)[methodName];
    if (typeof fn !== "function") {
      // Cache hit but the instance has no such method — almost always a
      // mis-registration (a typo'd method name landed in the dispatch
      // cache). Distinct from the "no entry at all" case above so the
      // failure mode is unambiguous.
      throw new UnsupportedVisitError(
        `Dispatch method '${methodName}' is not defined on ${this.constructor.name} for node ${ctor.name}`,
      );
    }
    return (fn as (n: Node, c?: unknown) => unknown).call(this, object, collector);
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
