import {
  TopLevel,
  constDefined,
  constSet,
  include,
  rbConstGet,
  rbModRemoveConst,
  type Included,
} from "@blazetrails/ruby-compat";
import { require } from "./core-ext/kernel.js";
import { RealModName } from "./real-mod-name.js";

/** @noRailsEquivalent PERMANENT */
function _seat(mod: object): object {
  return mod === Object ? TopLevel : mod;
}

/** @noRailsEquivalent PERMANENT */
const _autoloads = new WeakMap<object, Map<string, string>>();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface Cref extends Included<typeof RealModName> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Cref {
  readonly mod: object;
  readonly cname: string;
  private _path: string | null;

  constructor(mod: object, cname: string) {
    this.mod = mod;
    this.cname = cname;
    this._path = null;
  }

  path(): string {
    return (this._path ??=
      this.mod === Object ? this.cname : `${this.realModName(this.mod) ?? ""}::${this.cname}`);
  }

  isAutoload(): string | null {
    if (constDefined(_seat(this.mod) as { readonly name: string }, this.cname, false)) return null;
    return _autoloads.get(this.mod)?.get(this.cname) ?? null;
  }

  autoload(abspath: string): void {
    if (constDefined(_seat(this.mod) as { readonly name: string }, this.cname, false)) return;
    let cnames = _autoloads.get(this.mod);
    if (cnames === undefined) _autoloads.set(this.mod, (cnames = new Map()));
    cnames.set(this.cname, abspath);
  }

  /** @inventedArm if — PERMANENT */
  isDefined(): boolean {
    if (this.isAutoload() != null) return true;
    return constDefined(_seat(this.mod) as { readonly name: string }, this.cname, false);
  }

  set<T>(value: T): T {
    _autoloads.get(this.mod)?.delete(this.cname);
    return constSet(_seat(this.mod) as { readonly name: string }, this.cname, value);
  }

  get(): unknown {
    return rbConstGet(_seat(this.mod), this.cname, true, false);
  }

  /** @noRailsEquivalent PERMANENT */
  async autoloadGet(): Promise<unknown> {
    const autoloadPath = this.isAutoload();
    if (autoloadPath != null) await require(autoloadPath);
    return this.get();
  }

  /** @inventedArm if — PERMANENT */
  remove(): unknown {
    const autoloadPath = this.isAutoload();
    _autoloads.get(this.mod)?.delete(this.cname);
    if (autoloadPath != null) return null;
    return rbModRemoveConst(this.mod, this.cname);
  }
}

Cref.prototype.toString = Cref.prototype.path;
include(Cref, RealModName);
