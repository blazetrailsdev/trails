import { getApp } from "./config.js";
import { GID, validateApp, type GidComponents } from "./uri/gid.js";
import type { LocateOptions, LocatorLike, LocatorModel } from "./locator.js";
import { constantize, Deprecation } from "@blazetrails/activesupport";

let _deprecator: Deprecation | undefined;

function isOrExtends(klass: LocatorModel, base: { prototype: object }): boolean {
  if ((klass as unknown) === base) return true;
  const proto = (klass as unknown as { prototype?: unknown }).prototype;
  return typeof proto === "object" && proto !== null && proto instanceof (base as never);
}

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

  deconstructKeys(keys: readonly string[] | null = null): GidComponents {
    return this.uri.deconstructKeys(keys);
  }

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
    const { app: _a, verifier: _v, for: _f, ...rest } = opts;
    const filteredParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v != null) filteredParams[k] = String(v);
    }
    const params = Object.keys(filteredParams).length ? filteredParams : null;
    return new this(GID.create(app, model, params), options);
  }

  static parse(gid: string | GlobalID, options: GlobalIDOptions = {}): GlobalID | null {
    if (gid instanceof this) return gid;
    try {
      return new this(gid, options);
    } catch {
      return this.parseEncodedGid(gid, options);
    }
  }

  private static parseEncodedGid(gid: string, options: GlobalIDOptions): GlobalID | null {
    try {
      const b64 = gid.replace(/-/g, "+").replace(/_/g, "/");
      const urlsafeDecode64 = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
      return new this(urlsafeDecode64, options);
    } catch {
      return null;
    }
  }

  static async defaultLocator(defaultLocator: LocatorLike): Promise<void> {
    const { Locator } = await import("./locator.js");
    Locator.defaultLocator = defaultLocator;
  }

  toParam(): string {
    return btoa(this.toString()).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  toString(): string {
    return this.uri.toString();
  }

  asJson(): string {
    return this.toString();
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  toJSON(): string {
    return this.asJson();
  }

  /** @internal */
  [Symbol.toPrimitive](_hint: string): string {
    return this.toString();
  }

  equals(other: GlobalID): boolean {
    return other instanceof GlobalID && this.uri.equals(other.uri);
  }

  static deprecator(): Deprecation {
    return (_deprecator ??= new Deprecation("2.1", "GlobalID"));
  }

  static validateApp(app: string | null | undefined): string {
    return validateApp(app);
  }

  get modelClass(): LocatorModel {
    const klass = constantize(this.modelName) as LocatorModel;
    if (isOrExtends(klass, GlobalID)) {
      throw new Error("GlobalID and SignedGlobalID cannot be used as model_class.");
    }
    return klass;
  }

  async find(options?: LocateOptions): Promise<unknown | null> {
    const { Locator } = await import("./locator.js");
    return Locator.locate(this, options);
  }
}
