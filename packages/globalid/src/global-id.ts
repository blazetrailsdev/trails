import { getApp } from "./config.js";
import { buildGid, parseGid, validateApp, type GidComponents } from "./uri/gid.js";

export interface GlobalIDModel {
  id: unknown;
  constructor: { name: string };
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
    // Skip the parseGid round-trip — mirror its modelId normalization
    // here: stringify with `?? ""` (matching buildGid), filter empty
    // segments, collapse to a single string when arity = 1. buildGid
    // guarantees the segment is non-empty overall (throws otherwise),
    // so `parts` is always at least one element here.
    const idParts = (Array.isArray(model.id) ? model.id : [model.id])
      .map((p) => String(p ?? ""))
      .filter((p) => p.length > 0);
    const modelId: string | string[] = idParts.length === 1 ? idParts[0] : idParts;
    const components: GidComponents = {
      app,
      modelName,
      modelId,
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
}
