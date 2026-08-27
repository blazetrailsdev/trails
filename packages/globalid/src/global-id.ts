import { getApp } from "./config.js";
import { GID, validateApp, type GidComponents } from "./uri/gid.js";
// TYPE-ONLY on purpose: a runtime edge from here back into the
// global-id ↔ signed-global-id ↔ locator cycle would evaluate
// `class SignedGlobalID extends GlobalID` while `GlobalID` is still in TDZ.
// `find` therefore reaches Locator through a dynamic import.
import type { LocateOptions, LocatorLike, LocatorModel } from "./locator.js";
import { constantize } from "@blazetrails/activesupport";

/**
 * Mirrors Ruby's `model <= GlobalID` — matches the identity itself OR any
 * subclass. Safe for non-constructor `LocatorModel` values (returns false
 * instead of throwing on missing `.prototype`).
 */
function isOrExtends(klass: LocatorModel, base: { prototype: object }): boolean {
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
  readonly uri: GID;

  /** Mirrors: GlobalID#initialize(gid, options) */
  constructor(gid: string | GID, _options: GlobalIDOptions = {}) {
    this.uri = gid instanceof GID ? gid : GID.parse(gid);
  }

  get app(): string {
    return this.uri.app;
  }
  get modelName(): string {
    return this.uri.modelName;
  }
  get modelId(): string | string[] {
    return this.uri.modelId;
  }
  get params(): Record<string, string> {
    return this.uri.params;
  }

  /** Mirrors: GlobalID#deconstruct_keys — `delegate :deconstruct_keys, to: :uri`. */
  deconstructKeys(keys: readonly string[] | null = null): GidComponents {
    return this.uri.deconstructKeys(keys);
  }

  /**
   * Mirrors: GlobalID.create — the `this` constructor type carries Ruby's
   * polymorphic `new`, so `SignedGlobalID.create` runs this body and hands
   * back a SignedGlobalID.
   */
  static create<T extends GlobalID, O extends GlobalIDOptions>(
    this: new (gid: string | GID, options?: O) => T,
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
    // including SignedGlobalID's expiration options, becomes a URI param.
    const { app: _a, verifier: _v, for: _f, ...rest } = opts;
    const filteredParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v != null) filteredParams[k] = String(v);
    }
    const params = Object.keys(filteredParams).length ? filteredParams : null;
    return new this(GID.create(app, model, params), options);
  }

  /** Mirrors: GlobalID.parse — falls back to base64-decoded form. */
  static parse(gid: string | GlobalID, options: GlobalIDOptions = {}): GlobalID | null {
    if (gid instanceof this) return gid;
    try {
      return new this(gid, options);
    } catch {
      return this.parseEncodedGid(gid, options);
    }
  }

  /**
   * Mirrors: GlobalID.parse_encoded_gid (private) —
   * `new(Base64.urlsafe_decode64(gid), options) rescue nil`.
   */
  private static parseEncodedGid(gid: string, options: GlobalIDOptions): GlobalID | null {
    try {
      const b64 = gid.replace(/-/g, "+").replace(/_/g, "/");
      const urlsafeDecode64 = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
      return new this(urlsafeDecode64, options);
    } catch {
      return null;
    }
  }

  /**
   * Mirrors: GlobalID.default_locator(default_locator) —
   * `Locator.default_locator = default_locator`.
   *
   * Async because Locator is reached through a dynamic import: a runtime
   * edge from here into the global-id ↔ signed-global-id ↔ locator cycle
   * would evaluate `class SignedGlobalID extends GlobalID` with `GlobalID`
   * still in TDZ (same constraint as `find` above).
   */
  static async defaultLocator(defaultLocator: LocatorLike): Promise<void> {
    const { Locator } = await import("./locator.js");
    Locator.defaultLocator = defaultLocator;
  }

  /** Mirrors: GlobalID#to_param — base64url without padding. */
  toParam(): string {
    return btoa(this.toString()).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  toString(): string {
    return this.uri.toString();
  }

  /**
   * Mirrors: GlobalID#as_json — `def as_json(*) = to_s`. Rails' `as_json`
   * calls `to_s`, so a SignedGlobalID serializes to its signed token rather
   * than the bare URI; route through `toString()` to keep that polymorphism.
   */
  asJson(): string {
    return this.toString();
  }

  /**
   * The JS serialization hook; delegates to the ported `asJson`.
   *
   * @internal
   * @noRailsEquivalent PERMANENT — `JSON.stringify` dispatches on `toJSON`,
   * which is the JS spelling of what Ruby reaches through `as_json`; without
   * it a GlobalID serializes as a bare object rather than its URI.
   */
  toJSON(): string {
    return this.asJson();
  }

  /** @internal */
  [Symbol.toPrimitive](_hint: string): string {
    return this.toString();
  }

  /** Mirrors: GlobalID#== — `other.is_a?(GlobalID) && uri == other.uri`. */
  equals(other: GlobalID): boolean {
    return other instanceof GlobalID && this.uri.equals(other.uri);
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
