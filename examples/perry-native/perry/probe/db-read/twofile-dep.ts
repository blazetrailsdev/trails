// Exported class with the same shape as StatementInvalid's leaf.
export class Exc extends Error {}
Exc.prototype.name = "Exc";
export class Mid extends Exc {}
export class Leaf extends Mid {
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
