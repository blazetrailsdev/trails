import { isHashAnalogue, rubyClassName } from "./ruby-class.js";

// visitor.rb:39
function describeClass(object: unknown): string {
  const rubyClass = rubyClassName(object);
  if (rubyClass !== null) return rubyClass;
  return (object as { constructor?: { name?: string } })?.constructor?.name ?? typeof object;
}

/** to_sql.rb:756 */
export type NodeCtor = abstract new (...args: never[]) => object;

/**
 * @noRailsEquivalent TypeScript-only ctor type; Ruby dispatches on the class object directly.
 */
type VisitorCtor = (abstract new (...args: never[]) => Visitor) &
  Pick<typeof Visitor, "dispatchCache"> & { registerDispatch?: () => void };

const PER_CLASS_CACHE = new WeakMap<VisitorCtor, Map<NodeCtor, string>>();

/**
 * Mirrors: Arel::Visitors::Visitor (activerecord/lib/arel/visitors/visitor.rb).
 *
 * to_sql.rb:842
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
      // visitor.rb:28-30
      if (Object.hasOwn(this, "registerDispatch")) this.registerDispatch?.();
    }
    return cache;
  }

  protected getDispatchCache(): Map<NodeCtor, string> {
    return (this.constructor as VisitorCtor).dispatchCache();
  }

  protected visit<C>(object: unknown, collector: C): C;
  protected visit(object: unknown): unknown;
  protected visit(object: unknown, collector?: unknown): unknown {
    const methodName = this.dispatchMethod(object);
    if (!methodName) {
      // eslint-disable-next-line blazetrails/rails-error-parity -- Ruby raises NoMethodError/TypeError here; TypeError is its JS analogue, not a missing ported class.
      throw new TypeError(`Cannot visit ${describeClass(object)}`);
    }
    // visitor.rb:36-37
    const fn = (this as unknown as Record<string, unknown>)[methodName] as (
      n: unknown,
      c?: unknown,
    ) => unknown;
    return fn.call(this, object, collector);
  }

  /**
   * visitor.rb:29
   */
  private dispatchMethod(object: unknown): string | undefined {
    // visitor.rb:28
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
   * visitor.rb:36-37
   */
  private respondsTo(methodName: string): boolean {
    return typeof (this as unknown as Record<string, unknown>)[methodName] === "function";
  }

  /**
   * visitor.rb:36-37, visitor.rb:40
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
