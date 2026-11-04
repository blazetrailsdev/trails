// Minimal, no String subclassing: a base constructor returning a Proxy, and a
// derived class installing a private field on the resulting `this`.
class Base {
  constructor(readonly value: string) {
    return new Proxy(this, {
      get(t, p, r) { return Reflect.get(t, p, r); },
    });
  }
}
class Derived extends Base {
  #local: boolean;
  constructor(env: string) {
    super(env);
    this.#local = env === "dev";
  }
  isLocal(): boolean { return this.#local; }
}
const d = new Derived("dev");
console.log(`value     = ${d.value}`);
console.log(`isLocal() = ${d.isLocal()}`);
console.log("ok");
