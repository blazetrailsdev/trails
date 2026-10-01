import {
  Hash,
  NoMethodError,
  TypeError,
  classpaths,
  rbModAncestors,
  rbModName,
  rbModToS,
  rbObjClass,
  rbObjRespondTo,
  rbSetClassPathString,
} from "@blazetrails/ruby-compat";
import { Visitors } from "../namespaces.js";

export type NodeCtor = abstract new (...args: never[]) => object;

type Klass = NodeCtor | string;

type DispatchMethod = (object: unknown, collector?: unknown) => unknown;

function objectClass(object: unknown): Klass {
  const klass = (object as { constructor?: unknown } | null | undefined)?.constructor;
  if (typeof klass !== "function") return rbObjClass(object);
  if (classpaths.has(klass) && Object.getPrototypeOf(object) === klass.prototype) {
    return klass as NodeCtor;
  }
  const name = rbObjClass(object);
  return rbModToS(klass as NodeCtor) === name ? (klass as NodeCtor) : name;
}

export abstract class Visitor {
  protected dispatch: Hash<Klass, string>;

  private static _dispatchCache?: Hash<Klass, string>;

  constructor() {
    this.dispatch = this.getDispatchCache();
  }

  accept<C>(object: unknown, collector: C): C;
  accept(object: unknown): unknown;
  accept(object: unknown, collector: unknown = null): unknown {
    return this.visit(object, collector);
  }

  /** @internal */
  static dispatchCache(this: typeof Visitor): Hash<Klass, string> {
    if (!Object.prototype.hasOwnProperty.call(this, "_dispatchCache")) {
      this._dispatchCache = new Hash<Klass, string>((hash, klass) => {
        const name = typeof klass === "string" ? klass : rbModName(klass);
        const dispatchMethod = `visit_${(name ?? "").replaceAll("::", "_")}`.replace(/_(?=.)/g, "");
        hash.set(klass, dispatchMethod);
        return dispatchMethod;
      }).compareByIdentity();
    }
    return this._dispatchCache!;
  }

  protected getDispatchCache(): Hash<Klass, string> {
    return (this.constructor as typeof Visitor).dispatchCache();
  }

  protected visit<C>(object: unknown, collector: C): C;
  protected visit(object: unknown): unknown;
  protected visit(object: unknown, collector: unknown = null): unknown {
    for (;;) {
      let dispatchMethod: string | undefined;
      try {
        dispatchMethod = this.dispatch.get(objectClass(object));
        if (collector != null && collector !== false) {
          return (this as unknown as Record<string, DispatchMethod>)[dispatchMethod!](
            object,
            collector,
          );
        } else {
          return (this as unknown as Record<string, DispatchMethod>)[dispatchMethod!](object);
        }
      } catch (e) {
        if (!(e instanceof NoMethodError || e instanceof globalThis.TypeError)) throw e;
        if (rbObjRespondTo(this, dispatchMethod!, true)) throw e;
        const klass = objectClass(object);
        const superklass = (
          typeof klass === "string" ? [klass] : (rbModAncestors(klass) as Klass[])
        ).find((klass) => rbObjRespondTo(this, this.dispatch.get(klass)!, true));
        if (superklass == null) throw new TypeError(`Cannot visit ${rbObjClass(object)}`);
        this.dispatch.set(objectClass(object), this.dispatch.get(superklass)!);
      }
    }
  }
}

rbSetClassPathString(Visitor, Visitors, "Visitor");
Visitors.Visitor = Visitor;
