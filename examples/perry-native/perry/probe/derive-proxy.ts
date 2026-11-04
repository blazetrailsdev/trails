// Wall 21 candidate fix: a subclass of a class whose constructor returns a Proxy
// cannot install a private field (`this.#local`). Deriving the value instead of
// storing it needs no field at all. Proves `String(this)` resolves through the
// get trap under Perry.
const LOCAL = ["development", "test"];

class SI extends String {
  constructor(value: string) {
    super(value);
    return new Proxy(this, {
      get(t, p: string | symbol, r) {
        if (Reflect.has(t, p)) {
          const v = Reflect.get(t, p, r);
          return typeof v === "function" &&
            v === (String.prototype as unknown as Record<string | symbol, unknown>)[p]
            ? v.bind(t)
            : v;
        }
        if (typeof p === "symbol") return Reflect.get(t, p, r);
        if (p.endsWith("?")) return () => t.valueOf() === p.slice(0, -1);
        return () => {
          throw new Error("nomethod " + p);
        };
      },
      has(t, p) {
        if (typeof p === "string" && p.endsWith("?")) return true;
        return Reflect.has(t, p);
      },
    });
  }
}

class EI extends SI {
  constructor(env: string) {
    super(env);
    for (const d of ["development", "test", "production"]) {
      (this as unknown as Record<string, boolean>)[d] = env === d;
    }
  }
  "local?"(): boolean {
    return LOCAL.includes(String(this));
  }
}

for (const env of ["development", "test", "production"]) {
  const i = new EI(env) as EI & Record<string, () => boolean>;
  console.log(
    `${env} local?=${i["local?"]()} dev?=${i["development?"]()} prod?=${i["production?"]()} str=${String(i)} staging?=${i["staging?"]()}`,
  );
}
