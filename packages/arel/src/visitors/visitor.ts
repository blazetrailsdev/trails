import {
  Hash,
  NoMethodError,
  TypeError,
  hashAset,
  rbObjClass,
  rbFSend,
  rbModAncestors,
  rbModName,
  rbObjClassname,
  rbObjRespondTo,
  rbModConstSet,
  rtest,
} from "@blazetrails/ruby-compat";
import { Visitors } from "../namespaces.js";

export abstract class Visitor {
  private _dispatch: Hash<object, string>;

  private static _dispatchCache?: Hash<object, string>;

  constructor() {
    this._dispatch = this.getDispatchCache();
  }

  accept<C>(object: unknown, collector: C): C;
  accept(object: unknown, collector?: null): unknown;
  accept(object: unknown, collector: unknown = null): unknown {
    return this.visit(object, collector);
  }

  /** @internal */
  protected get dispatch(): Hash<object, string> {
    return this._dispatch;
  }

  /** @internal */
  static dispatchCache(this: typeof Visitor): Hash<object, string> {
    return (
      (Object.hasOwn(this, "_dispatchCache") && this._dispatchCache) ||
      (this._dispatchCache = new Hash<object, string>((hash, klass) =>
        hashAset(
          hash,
          klass,
          `visit_${(rbModName(klass) ?? "").replaceAll("::", "_")}`.replace(
            /_+([a-zA-Z0-9])/g,
            (_, ch: string) => ch.toUpperCase(),
          ),
        ),
      ).compareByIdentity())
    );
  }

  protected getDispatchCache(): Hash<object, string> {
    return (this.constructor as typeof Visitor).dispatchCache();
  }

  protected visit<C>(object: unknown, collector: C): C;
  protected visit(object: unknown): unknown;
  protected visit(object: unknown, collector: unknown = null): unknown {
    for (;;) {
      let dispatchMethod: string | undefined;
      try {
        dispatchMethod = this.dispatch.get(rbObjClass(object));
        if (rtest(collector)) {
          return rbFSend(this, dispatchMethod!, object, collector);
        } else {
          return rbFSend(this, dispatchMethod!, object);
        }
      } catch (e) {
        if (!(e instanceof NoMethodError)) throw e;
        if (rbObjRespondTo(this, dispatchMethod!, true)) throw e;
        const superklass = rbModAncestors(rbObjClass(object)).find((klass) =>
          rbObjRespondTo(this, this.dispatch.get(klass)!, true),
        );
        if (superklass == null) throw new TypeError(`Cannot visit ${rbObjClassname(object)}`);
        this.dispatch.set(rbObjClass(object), this.dispatch.get(superklass)!);
      }
    }
  }
}

rbModConstSet(Visitors, "Visitor", Visitor);
