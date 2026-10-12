// The trails core idiom: a Proxy `get` trap falling back to methodMissing.
class Base {
  constructor() {
    return new Proxy(this, {
      get: (t, k, r) => (k in t ? Reflect.get(t, k, r) : () => `missing:${String(k)}`),
    });
  }
  real(): string {
    return "real";
  }
}
const b = new Base() as Base & Record<string, () => string>;
console.log(`[03] ${b.real()} ${b.findByName()}`);
