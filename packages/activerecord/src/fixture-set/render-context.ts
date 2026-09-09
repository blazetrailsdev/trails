import { FixtureSet } from "../fixtures.js";

export class RenderContext {
  static createSubclass(): new () => { getBinding(): Record<string, unknown> } {
    return class extends FixtureSet.contextClass {
      getBinding(): Record<string, unknown> {
        const binding: Record<string, unknown> = {};
        for (
          let proto: object | null = Object.getPrototypeOf(this) as object | null;
          proto !== null && proto !== Object.prototype;
          proto = Object.getPrototypeOf(proto) as object | null
        ) {
          for (const name of Object.getOwnPropertyNames(proto)) {
            if (name === "constructor") continue;
            if (Object.prototype.hasOwnProperty.call(binding, name)) continue;
            const value = (this as unknown as Record<string, unknown>)[name];
            binding[name] = typeof value === "function" ? value.bind(this) : value;
          }
        }
        return binding;
      }
    };
  }
}
