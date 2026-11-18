import type { RackEnv } from "@blazetrails/rack";
import { rbBlockGivenP, regexpEscape } from "@blazetrails/ruby-compat";

import { Resource, type ResourceOptions } from "./resource.js";

type OriginProc = (source: string | null, env: RackEnv) => unknown;
type Origin = string | RegExp | OriginProc;

export class Resources {
  readonly resources: Resource[];
  /** @internal */
  protected _origins: Origin[];
  /** @internal */
  protected publicResources: boolean;

  constructor() {
    this._origins = [];
    this.resources = [];
    this.publicResources = false;
  }

  /** @missingRailsCall compile — PERMANENT */
  origins(...args: (Origin | Origin[])[]): void {
    const blk = rbBlockGivenP(args.at(-1)) ? (args.pop() as OriginProc) : null;
    this._origins = args
      .flat()
      .filter((s) => s !== "")
      .map((n): Origin => {
        if (typeof n === "function" || n instanceof RegExp || /^[a-z][a-z0-9.+-]*:\/\//.test(n)) {
          return n;
        } else if (n === "*") {
          this.publicResources = true;
          return n;
        } else {
          return new RegExp(`^[a-z][a-z0-9.+-]*:\\/\\/${regexpEscape(n)}$`, "m");
        }
      })
      .flat();
    if (blk != null) this._origins.push(blk);
  }

  resource(path: string | RegExp, opts: ResourceOptions = {}): Resource[] {
    this.resources.push(new Resource(this.isPublicResources(), path, opts));
    return this.resources;
  }

  isPublicResources(): boolean {
    return this.publicResources;
  }

  isAllowOrigin(source: string | null, env: RackEnv = {}): boolean {
    if (this.isPublicResources()) return true;

    return (
      this._origins.find((origin) => {
        if (typeof origin === "function") {
          const r = origin(source, env);
          return r != null && r !== false;
        } else if (origin instanceof RegExp) {
          return source != null && origin.test(source);
        } else {
          return source === origin;
        }
      }) !== undefined
    );
  }

  matchResource(path: string | null, env: RackEnv): Resource | null {
    return this.resources.find((r) => r.isMatch(path, env)) ?? null;
  }

  resourceForPath(path: string | null): Resource | null {
    return this.resources.find((r) => r.isMatchesPath(path)) ?? null;
  }
}
