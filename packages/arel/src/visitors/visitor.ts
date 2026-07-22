import { isHashAnalogue, rubyClassName } from "./ruby-class.js";

// Rails interpolates `object.class` straight into its "Cannot visit" TypeError
// (visitor.rb:39). The nearest handle here is the Ruby class the value would
// have had, falling back to the JS constructor for a real class.
function describeClass(object: unknown): string {
  const rubyClass = rubyClassName(object);
  if (rubyClass !== null) return rubyClass;
  return (object as { constructor?: { name?: string } })?.constructor?.name ?? typeof object;
}

/**
 * Opaque dispatch-cache key for a class the visitor dispatches on.
 *
 * The instance type is `object`, not `Node`: Rails dispatches on
 * `object.class`, and the table is keyed by classes that are not Arel nodes
 * at all — `ActiveModel::Attribute` (to_sql.rb:756), `Set`.
 *
 * The parameter list is `never[]` (not `unknown[]`) because the dispatch
 * cache never constructs anything — the ctor is used purely as a Map key. TS
 * is contravariant in constructor parameter types, so `never[]` is the
 * only signature that accepts ctors of arbitrary arity (e.g.
 * `Binary(left, right)`, `BoundSqlLiteral(sql, binds)`). `unknown[]` would
 * reject any ctor with a more-specific parameter type.
 */
export type NodeCtor = abstract new (...args: never[]) => object;
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

  protected visit<C>(object: unknown, collector: C): C;
  protected visit(object: unknown): unknown;
  protected visit(object: unknown, collector?: unknown): unknown {
    const methodName = this.dispatchMethod(object);
    if (!methodName) {
      // Rails' second failure terminal: no handler on the class or any of its
      // ancestors falls out of `rescue NoMethodError` as a TypeError
      // (visitor.rb:39), distinct from a class whose handler is aliased to
      // `unsupported` and raises UnsupportedVisitError (to_sql.rb:828).
      throw new TypeError(`Cannot visit ${describeClass(object)}`);
    }
    // `dispatchMethod` only ever returns a name the visitor responds to
    // (mirroring `respond_to?(dispatch[klass], true)`, visitor.rb:36-37), so a
    // resolved name always names a real function here — a mis-registered class
    // resolves to an ancestor's handler or falls out as the TypeError above.
    const fn = (this as unknown as Record<string, unknown>)[methodName] as (
      n: unknown,
      c?: unknown,
    ) => unknown;
    return fn.call(this, object, collector);
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
    // Rails reads `object.class` (visitor.rb:28) — an intrinsic that a Hash's
    // contents can't shadow — before it ever looks inside. A JS record's
    // `constructor` is not that intrinsic: it can be an own or inherited data
    // key (`Object.create(null)` then `h.constructor = Set`, or
    // `Object.create({ constructor: Set })`), which would wrongly route the
    // record to that ctor's handler instead of `visit_Hash`. So the
    // ctor-cache path is for genuine class instances only; a Hash analogue
    // skips it and is classified by `rubyClassName`'s ancestor walk, exactly
    // as Ruby dispatches every Hash descendant to `visit_Hash`.
    if (!isHashAnalogue(object)) {
      const ctor = (object as { constructor?: NodeCtor } | null | undefined)?.constructor;
      if (typeof ctor === "function") {
        const byCtor = this.resolveDispatch(ctor);
        if (byCtor) return byCtor;
      }
    }
    const rubyClass = rubyClassName(object);
    if (rubyClass === null) return undefined;
    const byName = `visit${rubyClass}`;
    return this.respondsTo(byName) ? byName : undefined;
  }

  /**
   * Does this visitor actually have a method named `methodName`? Mirrors
   * Ruby's `respond_to?(dispatch[klass], true)` (visitor.rb:36-37): a dispatch
   * entry is only usable when the named method truly resolves to a function on
   * the visitor instance. `true` includes private methods; in JS every method
   * on the prototype chain is reachable, so a plain property lookup suffices.
   */
  private respondsTo(methodName: string): boolean {
    return typeof (this as unknown as Record<string, unknown>)[methodName] === "function";
  }

  /**
   * Resolve the dispatch method name for `ctor`, walking the JS prototype
   * chain to find an ancestor's handler when there is no direct entry.
   * Mirrors Ruby's `klass.ancestors.find { |k| respond_to?(dispatch[k]) }`
   * (visitor.rb:36-37): a dispatch entry counts only when its named method
   * actually resolves to a function on the visitor, so a class whose own entry
   * names a missing method falls through to an ancestor's working handler.
   * Successful lookups are memoized into the cache, matching Rails
   * (`dispatch[object.class] = dispatch[superklass]`, visitor.rb:40).
   */
  private resolveDispatch(ctor: NodeCtor): string | undefined {
    const direct = this.dispatch.get(ctor);
    if (direct && this.respondsTo(direct)) return direct;
    let cur: NodeCtor | null = ctor;
    while (cur) {
      const proto = Object.getPrototypeOf(cur.prototype) as object | null;
      const parent = proto?.constructor as NodeCtor | undefined;
      if (!parent || (parent as unknown) === Object) return undefined;
      const found = this.dispatch.get(parent);
      if (found && this.respondsTo(found)) {
        this.dispatch.set(ctor, found);
        return found;
      }
      cur = parent;
    }
    return undefined;
  }
}
