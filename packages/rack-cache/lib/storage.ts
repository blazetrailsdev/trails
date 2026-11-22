import {
  RuntimeError,
  URI,
  constDefined,
  constGet,
  rbObjMethod,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { EntityStore } from "./entity-store.js";
import { MetaStore } from "./meta-store.js";

type StoreClass = { resolve(uri: unknown, options?: Record<string, unknown>): unknown };

export class Storage {
  /** @internal */
  private _metastores: Record<string, unknown>;

  /** @internal */
  private _entitystores: Record<string, unknown>;

  constructor() {
    this._metastores = {};
    this._entitystores = {};
  }

  async resolveMetastoreUri(uri: unknown, options: Record<string, unknown> = {}): Promise<unknown> {
    return (this._metastores[String(uri)] ||= await this.createStore(MetaStore, uri, options));
  }

  async resolveEntitystoreUri(
    uri: unknown,
    options: Record<string, unknown> = {},
  ): Promise<unknown> {
    return (this._entitystores[String(uri)] ||= await this.createStore(EntityStore, uri, options));
  }

  clear(): null {
    for (const key of Object.keys(this._metastores)) delete this._metastores[key];
    for (const key of Object.keys(this._entitystores)) delete this._entitystores[key];
    return null;
  }

  /** @internal */
  private async createStore(
    type: object,
    uri: unknown,
    options: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (rbObjRespondTo(uri, "scheme") || rbObjRespondTo(uri, "toStr")) {
      if (!rbObjRespondTo(uri, "scheme")) uri = URI.parse(uri as string);
      const scheme = (uri as { scheme: string }).scheme.toUpperCase();
      if (constDefined(type, scheme)) {
        const klass = constGet(type, scheme) as StoreClass;
        if (rbObjMethod(klass, "resolve").arity() === 1) return await klass.resolve(uri);
        return await klass.resolve(uri, options);
      } else {
        throw new RuntimeError(`Unknown storage provider: ${String(uri)}`);
      }
    } else {
      const Dalli = await import("memjs").catch(() => null);
      if (Dalli != null && uri instanceof Dalli.Client) {
        return await (constGet(type, "Dalli") as StoreClass).resolve(uri);
      } else {
        throw new RuntimeError(`Unknown storage provider: ${String(uri)}`);
      }
    }
  }

  /** @internal */
  private static _singletonInstance = new Storage();

  static instance(): Storage {
    return Storage._singletonInstance;
  }
}
