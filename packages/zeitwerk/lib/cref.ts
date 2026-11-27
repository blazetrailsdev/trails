import { TopLevel } from "@blazetrails/ruby-compat/object";
import {
  autoloadDelete,
  rbAutoloadP,
  rbAutoloadStr,
  rbConstGet,
  rbModRemoveConst,
} from "@blazetrails/ruby-compat/variable";
import { constDefined, constSet, include, type Included } from "@blazetrails/ruby-compat/include";
import { RealModName } from "./real-mod-name.js";

/** @noRailsEquivalent PERMANENT */
function _seat(mod: object): object {
  return mod === Object ? TopLevel : mod;
}

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
    if (constDefined(_seat(this.mod), this.cname, false)) return null;
    return rbAutoloadP(this.mod, this.cname);
  }

  autoload(abspath: string): void {
    if (constDefined(_seat(this.mod), this.cname, false)) return;
    rbAutoloadStr(this.mod, this.cname, abspath);
  }

  /** @inventedArm if — PERMANENT */
  isDefined(): boolean {
    if (this.isAutoload() != null) return true;
    return constDefined(_seat(this.mod), this.cname, false);
  }

  set<T>(value: T): T {
    autoloadDelete(this.mod, this.cname);
    return constSet(_seat(this.mod) as { readonly name: string }, this.cname, value);
  }

  get(): unknown {
    return rbConstGet(_seat(this.mod), this.cname, true, false);
  }

  remove(): unknown {
    return rbModRemoveConst(this.mod, this.cname);
  }
}

Cref.prototype.toString = Cref.prototype.path;
include(Cref, RealModName);
