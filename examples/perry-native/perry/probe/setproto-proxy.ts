// activerecord installs its method_missing Proxy with
//   Object.setPrototypeOf(Base, new Proxy(Object.getPrototypeOf(Base), {get...}))
// perry's docs say Object.setPrototypeOf is "modeled as a no-op". If so this
// silently does nothing rather than throwing.
class Base {
  static real(): string { return "real"; }
}
const seen: string[] = [];
Object.setPrototypeOf(
  Base,
  new Proxy(Object.getPrototypeOf(Base) as object, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && prop.startsWith("findBy")) {
        seen.push(prop);
        return () => `dynamic:${prop}`;
      }
      return Reflect.get(target, prop, receiver);
    },
  }),
);
const dyn = (Base as unknown as Record<string, () => string>)["findByName"];
console.log(`static method still works = ${Base.real()}`);
console.log(`dynamic matcher resolved  = ${typeof dyn === "function" ? dyn() : "UNDEFINED (proxy not installed)"}`);
console.log(`trap fired                = ${seen.length > 0}`);
