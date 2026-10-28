/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging -- mirrors ruby-compat's exception.ts */
// Exactly ruby-compat's Exception pattern: a class, a merged interface
// declaring a method the class body does NOT define, and a prototype.name
// assignment -- then the real chain's depth below it.
export class Exc extends Error {}

export interface Exc {
  detailedMessage(opt?: { highlight?: boolean | null } | null): string;
}

Exc.prototype.name = "Exc";
Exc.prototype.detailedMessage = function detailedMessage(): string {
  return "detailed";
};

export class Std extends Exc {}
export class ARErr extends Std {}
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
}
