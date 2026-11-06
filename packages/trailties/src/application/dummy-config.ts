import { rbObjRespondTo } from "@blazetrails/ruby-compat";

/** @internal */
export class DummyConfig {
  private config: object;

  constructor(config: object) {
    this.config = config;
    return new Proxy(this, {
      get(target, key, receiver) {
        if (typeof key !== "string" || key in target) return Reflect.get(target, key, receiver);
        return target.methodMissing(key);
      },
    });
  }

  toString(): string {
    return "DummyConfig";
  }

  methodMissing(selector: string): unknown {
    if (rbObjRespondTo(this.config, selector)) {
      const value = (this.config as Record<string, unknown>)[selector];
      return typeof value === "function" ? value.bind(this.config) : value;
    } else {
      return this;
    }
  }
}
