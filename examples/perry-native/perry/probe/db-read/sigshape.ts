/* eslint-disable @typescript-eslint/no-explicit-any -- probe */
// Wall 11 shape test, no imports: does a method's SIGNATURE decide whether it
// survives? StatementInvalid.setQuery returns `StatementInvalid | Promise<StatementInvalid>`
// -- self-referential and a union -- unlike every method that survived so far.
class Exc extends Error {}
Exc.prototype.name = "Exc";
class Std extends Exc {}
class ARErr extends Std {}
class AdErr extends ARErr {
  protected _pool?: unknown;
  get pool(): unknown {
    return this._pool;
  }
}
class Leaf extends AdErr {
  protected _flag = false;

  // exactly setQuery's shape: self-referential union, two params
  selfUnion(sql: string, binds: unknown[]): Leaf | Promise<Leaf> {
    if (!this._flag) {
      this._flag = true;
    }
    void sql;
    void binds;
    return this;
  }
  returnsThis(x: unknown): this {
    void x;
    return this;
  }
  returnsSelf(): Leaf {
    return this;
  }
  returnsPromiseSelf(): Promise<Leaf> {
    return Promise.resolve(this);
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

const l = new Leaf("boom");
for (const m of ["selfUnion", "returnsThis", "returnsSelf", "returnsPromiseSelf", "returnsPlain"]) {
  console.log("  typeof", m, "=", typeof (l as any)[m]);
}
console.log("  pool accessor =", typeof (l as any).pool);
