// A base constructor that returns a Proxy makes that Proxy the `this` of the
// derived constructor, so the derived class's private field is installed on the
// Proxy. activesupport's StringInquirer/EnvironmentInquirer pair does exactly this.
class Base extends String {
  constructor(value: string) {
    super(value);
    return new Proxy(this, {
      get(target, prop, receiver) { return Reflect.get(target, prop, receiver); },
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
console.log(`valueOf   = ${d.valueOf()}`);
console.log(`isLocal() = ${d.isLocal()}`);
console.log(`ok`);
