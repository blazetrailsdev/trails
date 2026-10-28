/* eslint-disable @typescript-eslint/no-explicit-any -- probe */
// Wall 11: the real chain's base class comes from ANOTHER PACKAGE
// (StandardError from @blazetrails/ruby-compat). Everything local survived;
// does extending an imported-from-package base cost the leaf its own methods?
import { StandardError } from "@blazetrails/ruby-compat";

export class ARErr extends StandardError {}
export class AdErr extends ARErr {
  protected _pool?: unknown;
  get pool(): unknown {
    return this._pool;
  }
}
export class Leaf extends AdErr {
  protected _flag = false;
  selfUnion(sql: string, binds: unknown[]): Leaf | Promise<Leaf> {
    this._flag = true;
    void sql;
    void binds;
    return this;
  }
  returnsPlain(): string {
    return "plain";
  }
}

function names(label: string, ctor: unknown): void {
  const proto = (ctor as { prototype?: object }).prototype;
  console.log(label, "=", JSON.stringify(Object.getOwnPropertyNames(proto ?? {}).sort()));
}
names("Leaf ", Leaf);
names("AdErr", AdErr);
names("ARErr", ARErr);

const l = new Leaf("boom");
console.log("instanceof Leaf      =", l instanceof Leaf);
console.log("instanceof StdError  =", l instanceof StandardError);
console.log("typeof selfUnion     =", typeof (l as any).selfUnion);
console.log("typeof returnsPlain  =", typeof (l as any).returnsPlain);
