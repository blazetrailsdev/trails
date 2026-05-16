import { getApp } from "./config.js";
import {
  buildGid,
  normalizeModelId,
  parseGid,
  validateApp,
  type GidComponents,
} from "./uri/gid.js";
import { Locator, lookupClass, type LocateOptions, type LocatorModel } from "./locator.js";
// LAZY-IMPORT CYCLE: global-id ↔ signed-global-id ↔ locator. Safe because
// every cross-module reference below happens inside a method body (runtime),
// not at class-body init time. Do NOT add module-level `const X = SignedGlobalID.foo`
// or similar — native ESM throws ReferenceError (TDZ) for an uninitialized
// imported binding accessed during the initial circular evaluation.
import { SignedGlobalID } from "./signed-global-id.js";

/**
 * @internal Mirrors Ruby's `model <= GlobalID` — matches the identity
 * itself OR any subclass. Safe for non-constructor `LocatorModel`
 * values (returns false instead of throwing on missing `.prototype`).
 */
export function isOrExtends(klass: LocatorModel, base: { prototype: object }): boolean {
  if ((klass as unknown) === base) return true;
  const proto = (klass as unknown as { prototype?: unknown }).prototype;
  return typeof proto === "object" && proto !== null && proto instanceof (base as never);
}

/**
 * Duck-typed model accepted by `GlobalID.create` / `SignedGlobalID.create`.
 *
 * Requires `id` plus a constructor exposing a `name` string — both real
 * class instances (whose `.constructor` is `Function`, which has `name`)
 * and synthetic literal fixtures (`{ id, constructor: { name } }`)
 * structurally satisfy the `{ readonly name: string }` shape.
 */
export interface GlobalIDModel {
  id: unknown;
  readonly constructor: { readonly name: string };
}

export interface GlobalIDOptions {
  app?: string;
  [key: string]: unknown;
}

export class GlobalID {
  readonly uri: string;
  private readonly _components: GidComponents;

  private constructor(uri: string, components: GidComponents) {
    this.uri = uri;
    this._components = components;
  }

  get app(): string {
    return this._components.app;
  }
  get modelName(): string {
    return this._components.modelName;
  }
  get modelId(): string | string[] {
    return this._components.modelId;
  }
  get params(): Record<string, string> {
    return this._components.params;
  }

  /** Mirrors: GlobalID.create */
  static create(model: GlobalIDModel, options: GlobalIDOptions = {}): GlobalID {
    const app = options.app ?? getApp();
    if (!app) {
      throw new Error(
        "An app is required to create a GlobalID. Pass the :app option or set the default GlobalID.app via setApp().",
      );
    }
    const { app: _a, verifier: _v, for: _f, ...rest } = options as Record<string, unknown>;
    const filteredParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v != null) filteredParams[k] = String(v);
    }
    const modelName = model.constructor.name;
    const params = Object.keys(filteredParams).length ? filteredParams : null;
    const uri = buildGid(app, modelName, model.id, params);
    const components: GidComponents = {
      app,
      modelName,
      modelId: normalizeModelId(model.id, modelName),
      params: params ?? {},
    };
    return new GlobalID(uri, components);
  }

  /** Mirrors: GlobalID.parse — falls back to base64-decoded form. */
  static parse(gid: string | GlobalID, _options: GlobalIDOptions = {}): GlobalID | null {
    if (gid instanceof GlobalID) return gid;
    try {
      return new GlobalID(gid, parseGid(gid));
    } catch {
      try {
        const b64 = gid.replace(/-/g, "+").replace(/_/g, "/");
        const decoded = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
        return new GlobalID(decoded, parseGid(decoded));
      } catch {
        return null;
      }
    }
  }

  /** Mirrors: GlobalID#to_param — base64url without padding. */
  toParam(): string {
    return btoa(this.uri).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  toString(): string {
    return this.uri;
  }

  /** Mirrors: GlobalID#as_json — `JSON.stringify(gid)` produces `"gid://..."`. */
  toJSON(): string {
    return this.uri;
  }

  /** @internal */
  [Symbol.toPrimitive](_hint: string): string {
    return this.uri;
  }

  /** Mirrors: GlobalID#== */
  equals(other: GlobalID): boolean {
    return other instanceof GlobalID && this.uri === other.uri;
  }

  /** Mirrors: GlobalID.app= validation */
  static validateApp(app: string | null | undefined): string {
    return validateApp(app);
  }

  /**
   * Resolve the model class via the registered ModelFinder.
   *
   * Mirrors: GlobalID#model_class — `model_name.constantize`. Raises if the
   * resolved class is GlobalID / SignedGlobalID (Rails has the same guard
   * against recursive `model_class` lookup).
   */
  get modelClass(): LocatorModel {
    const klass = lookupClass(this.modelName);
    if (!klass) {
      throw new Error(
        `Cannot resolve model class for ${this.modelName}. Register the class via setModelFinder.`,
      );
    }
    // Rails: `if model <= GlobalID then raise ArgumentError` — rejects
    // GlobalID itself and any subclass. In Ruby SGID < GID so the
    // single `<=` check covers both. In TS they're peers, and we also
    // need to catch subclasses via prototype-chain checks. Guard the
    // prototype access since the finder is structurally typed and a
    // non-constructor value technically satisfies LocatorModel.
    if (isOrExtends(klass, GlobalID) || isOrExtends(klass, SignedGlobalID)) {
      throw new Error("GlobalID and SignedGlobalID cannot be used as model_class.");
    }
    return klass;
  }

  /**
   * Find the record this GID references.
   *
   * Mirrors: GlobalID#find — delegates to `Locator.locate(self, options)`.
   */
  find(options?: LocateOptions): Promise<unknown | null> {
    return Locator.locate(this, options);
  }
}
