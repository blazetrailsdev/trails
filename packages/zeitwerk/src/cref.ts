import {
  TopLevel,
  constDefined,
  constSet,
  include,
  rbModConstMissing,
  rbModRemoveConst,
  type Included,
} from "@blazetrails/ruby-compat";
import { RealModName } from "./real-mod-name.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface Cref extends Included<typeof RealModName> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Cref {
  readonly mod: object;
  readonly cname: string;
  private _path: string | null;

  constructor(mod: object, cname: string) {
    this.mod = mod === Object ? TopLevel : mod;
    this.cname = cname;
    this._path = null;
  }

  path(): string {
    return (this._path ??=
      this.mod === TopLevel ? this.cname : `${this.realModName(this.mod)}::${this.cname}`);
  }

  isDefined(): boolean {
    return constDefined(this.mod as { readonly name: string }, this.cname, false);
  }

  set<T>(value: T): T {
    return constSet(this.mod as { readonly name: string }, this.cname, value);
  }

  get(): unknown {
    if (this.isDefined()) return (this.mod as Record<string, unknown>)[this.cname];
    return rbModConstMissing(this.mod === TopLevel ? null : this.mod, this.cname);
  }

  remove(): unknown {
    return rbModRemoveConst(this.mod, this.cname);
  }
}

Cref.prototype.toString = Cref.prototype.path;
include(Cref, RealModName);
