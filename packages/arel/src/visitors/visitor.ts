import { rbModName, rbObjClass, rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Visitors } from "../namespaces.js";

export type NodeCtor = abstract new (...args: never[]) => object;

const PER_CLASS_CACHE = new WeakMap<typeof Visitor, Map<NodeCtor, string>>();

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

  /** @internal */
  static dispatchCache(this: typeof Visitor): Map<NodeCtor, string> {
    let cache = PER_CLASS_CACHE.get(this);
    if (!cache) {
      const parent = Object.getPrototypeOf(this) as typeof Visitor | null;
      const inherited =
        parent && typeof parent.dispatchCache === "function" && parent !== this
          ? parent.dispatchCache()
          : undefined;
      cache = new Map(inherited);
      PER_CLASS_CACHE.set(this, cache);
    }
    return cache;
  }

  protected getDispatchCache(): Map<NodeCtor, string> {
    return (this.constructor as typeof Visitor).dispatchCache();
  }

  protected visit<C>(object: unknown, collector: C): C;
  protected visit(object: unknown): unknown;
  protected visit(object: unknown, collector?: unknown): unknown {
    const methodName = this.dispatchMethod(object);
    if (!methodName) {
      // eslint-disable-next-line blazetrails/rails-error-parity -- Ruby raises NoMethodError/TypeError here; TypeError is its JS analogue, not a missing ported class.
      throw new TypeError(`Cannot visit ${rbObjClass(object)}`);
    }
    const fn = (this as unknown as Record<string, unknown>)[methodName] as (
      n: unknown,
      c?: unknown,
    ) => unknown;
    return fn.call(this, object, collector);
  }

  private dispatchMethod(object: unknown): string | undefined {
    const klass = rbObjClass(object);
    if (klass !== "Hash") {
      const ctor = (object as { constructor?: NodeCtor } | null | undefined)?.constructor;
      if (typeof ctor === "function") {
        const byCtor = this.resolveDispatch(ctor);
        if (byCtor) return byCtor;
      }
    }
    const byName = `visit${klass.replaceAll("::", "")}`;
    return this.respondsTo(byName) ? byName : undefined;
  }

  private respondsTo(methodName: string): boolean {
    return typeof (this as unknown as Record<string, unknown>)[methodName] === "function";
  }

  private resolveDispatch(ctor: NodeCtor): string | undefined {
    let cur: NodeCtor | null = ctor;
    while (cur) {
      const found = this.dispatch.get(cur) ?? this.deriveDispatch(cur);
      if (found && this.respondsTo(found)) {
        this.dispatch.set(ctor, found);
        return found;
      }
      const proto = Object.getPrototypeOf(cur.prototype) as object | null;
      const parent = proto?.constructor as NodeCtor | undefined;
      cur = !parent || (parent as unknown) === Object ? null : parent;
    }
    return undefined;
  }

  private deriveDispatch(klass: NodeCtor): string | undefined {
    const name = rbModName(klass);
    return name === null ? undefined : `visit${name.replaceAll("::", "")}`;
  }
}

rbSetClassPathString(Visitor, Visitors, "Visitor");
Visitors.Visitor = Visitor;
