import { getApp } from "./config.js";
import { GID, validateApp, type GidComponents } from "./uri/gid.js";
// TYPE-ONLY on purpose: `global-id` must stay a leaf of the
// global-id ↔ signed-global-id ↔ locator cycle. `class SignedGlobalID extends
// GlobalID` reads the `GlobalID` binding at class-body evaluation time, so any
// runtime edge out of this module that loops back here would evaluate
// signed-global-id while `GlobalID` is still in TDZ (native ESM throws
// ReferenceError). `find` therefore reaches Locator through a dynamic import.
import type { LocateOptions, LocatorModel } from "./locator.js";
import { constantize } from "@blazetrails/activesupport";

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

/**
 * @internal Constructor shape behind the `new this(...)` in `create` / `parse`,
 * mirroring Ruby's polymorphic `new`: `SignedGlobalID.create` runs the
 * inherited `GlobalID.create` body and gets a SignedGlobalID back.
 */
export type GlobalIDConstructor<T extends GlobalID, O extends GlobalIDOptions> = new (
  gid: string | GID,
  options?: O,
) => T;

export class GlobalID {
  readonly uri: string;
  /** @internal Snapshot of the parsed `URI::GID`; Rails delegates to `@uri`. */
  protected readonly _components: GidComponents;

  /** Mirrors: GlobalID#initialize(gid, options) */
  constructor(gid: string | GID, _options: GlobalIDOptions = {}) {
    const parsed = gid instanceof GID ? gid : GID.parse(gid);
    this.uri = parsed.toString();
    this._components = parsed.deconstructKeys();
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
  static create<T extends GlobalID, O extends GlobalIDOptions>(
    this: GlobalIDConstructor<T, O>,
    model: GlobalIDModel,
    options?: O,
  ): T {
    const opts: GlobalIDOptions = options ?? {};
    const app = opts.app ?? getApp();
    if (!app) {
      throw new Error(
        "An app is required to create a GlobalID. Pass the :app option or set the default GlobalID.app via setApp().",
      );
    }
    // Rails: `options.except(:app, :verifier, :for)` — every other key,
    // including SignedGlobalID's :expires_in / :expires_at, becomes a URI param.
    const { app: _a, verifier: _v, for: _f, ...rest } = opts;
    const filteredParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v != null) filteredParams[k] = String(v);
    }
    const modelName = model.constructor.name;
    const params = Object.keys(filteredParams).length ? filteredParams : null;
    return new this(GID.build({ app, modelName, modelId: model.id, params }), options);
  }

  /** Mirrors: GlobalID.parse — falls back to base64-decoded form. */
  static parse(gid: string | GlobalID, options: GlobalIDOptions = {}): GlobalID | null {
    if (gid instanceof this) return gid;
    const str = String(gid);
    try {
      return new this(GID.parse(str), options);
    } catch {
      try {
        const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
        const decoded = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
        return new this(GID.parse(decoded), options);
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

  /**
   * Mirrors: GlobalID#as_json — `JSON.stringify(gid)` produces `"gid://..."`.
   * Rails' `as_json` calls `to_s`, so a SignedGlobalID serializes to its
   * signed token rather than the bare URI; route through `toString()` to
   * keep that polymorphism.
   */
  toJSON(): string {
    return this.toString();
  }

  /** @internal */
  [Symbol.toPrimitive](_hint: string): string {
    return this.toString();
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
   * Mirrors: GlobalID#model_class — `model_name.constantize`. Raises if the
   * resolved class is GlobalID / SignedGlobalID (Rails has the same guard
   * against recursive `model_class` lookup); `SignedGlobalID < GlobalID`, so
   * the single `model <= GlobalID` check covers both.
   */
  get modelClass(): LocatorModel {
    const klass = constantize(this.modelName) as LocatorModel;
    if (isOrExtends(klass, GlobalID)) {
      throw new Error("GlobalID and SignedGlobalID cannot be used as model_class.");
    }
    return klass;
  }

  /**
   * Find the record this GID references.
   *
   * Mirrors: GlobalID#find — delegates to `Locator.locate(self, options)`.
   */
  async find(options?: LocateOptions): Promise<unknown | null> {
    const { Locator } = await import("./locator.js");
    return Locator.locate(this, options);
  }
}
