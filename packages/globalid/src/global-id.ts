import { GID, type GidComponents } from "./uri/gid.js";
import type { Identification as IdentificationModule } from "./identification.js";
import type {
  LocateOptions,
  Locator as LocatorClass,
  LocatorLike,
  LocatorModel,
} from "./locator.js";
import type { Verifier as VerifierClass } from "./verifier.js";
import {
  Autoload,
  type HashWithIndifferentAccess,
  constantize,
  Deprecation,
  extend,
  type Extended,
} from "@blazetrails/activesupport";
import { ArgumentError, block, fetch, rbHash } from "@blazetrails/ruby-compat";

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
  private static _app: string | undefined;

  static get app(): string | undefined {
    return this._app;
  }

  readonly uri: GID;
  private _modelClass: LocatorModel | undefined;

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
  get params(): HashWithIndifferentAccess<string> | null {
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
    const app = fetch<string | undefined>(
      opts,
      "app",
      block(() => GlobalID.app),
    );
    if (app == null) {
      throw new ArgumentError(
        "An app is required to create a GlobalID. Pass the :app option or set the default GlobalID.app.",
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

  static async find(
    gid: string | GlobalID,
    options: LocateOptions & GlobalIDOptions = {},
  ): Promise<unknown | null> {
    return (await this.parse(gid, options)?.find(options)) ?? null;
  }

  static parse(gid: string | GlobalID, options: GlobalIDOptions = {}): GlobalID | null {
    if (gid instanceof this) return gid;
    try {
      return new this(gid, options);
    } catch {
      return this.parseEncodedGid(gid, options);
    }
  }

  static setApp(app: string | null | undefined): void {
    this._app = GID.validateApp(app);
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

  declare eql: GlobalID["equals"];

  hash(): number {
    return rbHash(this.constructor) | rbHash(this.uri);
  }

  static deprecator(): Deprecation {
    return (_deprecator ??= new Deprecation("2.1", "GlobalID"));
  }

  get modelClass(): LocatorModel {
    return (this._modelClass ??= (() => {
      const model = constantize(this.modelName) as LocatorModel;

      if (isOrExtends(model, GlobalID)) {
        throw new ArgumentError("GlobalID and SignedGlobalID cannot be used as model_class.");
      }
      return model;
    })());
  }

  async find(options?: LocateOptions): Promise<unknown | null> {
    const { Locator } = await import("./locator.js");
    return Locator.locate(this, options);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace GlobalID {
  const loadPath: Autoload.Autoload["loadPath"];
  let Locator: typeof LocatorClass;
  let Identification: typeof IdentificationModule;
  let Verifier: typeof VerifierClass;
  const autoload: Extended<typeof Autoload>["autoload"];
  const eagerAutoload: Extended<typeof Autoload>["eagerAutoload"];
  const eagerLoadBang: Extended<typeof Autoload>["eagerLoadBang"];
}
Object.assign(GlobalID, {
  loadPath: {
    "global_id/locator": () => import("./locator.js"),
    "global_id/identification": () => import("./identification.js"),
    "global_id/verifier": () => import("./verifier.js"),
    "global_id/signed_global_id": () => import("./signed-global-id.js"),
  },
});
extend(GlobalID, Autoload);

GlobalID.prototype.eql = GlobalID.prototype.equals;

GlobalID.eagerAutoload(() => {
  GlobalID.autoload("Locator");
  GlobalID.autoload("Identification");
  GlobalID.autoload("Verifier");
});

Object.defineProperty(GlobalID, "eagerLoadBang", {
  value: async function eagerLoadBang(this: typeof GlobalID): Promise<void> {
    await Autoload.eagerLoadBang.call(this);
    await this.loadPath["global_id/signed_global_id"]();
  },
  writable: true,
  configurable: true,
});
