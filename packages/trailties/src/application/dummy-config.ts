import { rbObjRespondTo } from "@blazetrails/ruby-compat";

export class DummyConfig {
  #config: object;
  #self: DummyConfig;

  /** @inventedArm if — PERMANENT */
  constructor(config: object) {
    this.#config = config;
    return (this.#self = new Proxy(this, {
      get(target, key, receiver) {
        if (typeof key !== "string") return Reflect.get(target, key, receiver);
        if (key in DummyConfig.prototype) {
          const value = Reflect.get(target, key, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return target.methodMissing(key);
      },
    }));
  }

  toString(): string {
    return "DummyConfig";
  }

  methodMissing(selector: string): unknown {
    if (rbObjRespondTo(this.#config, selector)) {
      const value = (this.#config as Record<string, unknown>)[selector];
      return typeof value === "function" ? value.bind(this.#config) : value;
    } else {
      return this.#self;
    }
  }
}
