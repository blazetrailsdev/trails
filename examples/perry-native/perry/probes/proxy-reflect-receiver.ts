class Configuration {
  constructor() {
    return new Proxy(this, {
      get(target, name, receiver) {
        if (typeof name === "symbol" || name in target) return Reflect.get(target, name, receiver);
        return "missing:" + String(name);
      },
    });
  }
  appGenerators(): string {
    return "gens";
  }
}
const c = new Configuration();
console.log(`[probe] ${c.appGenerators()} ${(c as unknown as Record<string, string>).other}`);
