let traps = 0;
class Gens {
  options: Record<string, unknown>;
  constructor() {
    this.options = {};
  }
  methodMissing(name: string, ...args: unknown[]): unknown {
    traps++;
    if (traps > 50) throw new RangeError("recursed through the trap");
    return [name, args.length, Object.keys(this.options).length];
  }
}
Object.setPrototypeOf(
  Gens.prototype,
  new Proxy(Object.create(Object.getPrototypeOf(Gens.prototype) as object) as object, {
    get(target, name, receiver: Gens) {
      if (typeof name === "symbol" || name in target || receiver === Gens.prototype)
        return Reflect.get(target, name, receiver);
      return (...args: unknown[]) => receiver.methodMissing(name, ...args);
    },
    set(target, name, value, receiver: Gens) {
      if (typeof name === "symbol" || name in target || receiver === Gens.prototype)
        return Reflect.set(target, name, value, receiver);
      receiver.methodMissing(`${name}=`, value);
      return true;
    },
  }),
);
const g = new Gens();
const has = Object.hasOwn(g, "options");
const r = (g as unknown as Record<string, (...a: unknown[]) => unknown>).testFramework("x");
console.log(`[probe] own=${has} traps=${traps} r=${JSON.stringify(r)}`);
