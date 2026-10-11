import { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import type { Hash } from "@blazetrails/ruby-compat";

export class ProtectedParams {
  [key: string]: unknown;

  #parameters: HashWithIndifferentAccess;
  #permitted = false;
  #self: this;

  constructor(parameters: Record<string, unknown> | HashWithIndifferentAccess = {}) {
    this.#parameters = new HashWithIndifferentAccess(parameters);
    const params = this.#parameters;
    const target = this;
    const isParameter = (key: string | symbol): key is string =>
      typeof key === "string" &&
      params.isKey(key) &&
      !Object.hasOwn(ProtectedParams.prototype, key);

    this.#self = new Proxy(this, {
      get(_t, key) {
        if (isParameter(key)) return params.get(key);
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set(_t, key, value) {
        if (typeof key === "string") params.set(key, value);
        return true;
      },
      has(_t, key) {
        return isParameter(key) || Reflect.has(target, key);
      },
      ownKeys() {
        return [...params.keys()];
      },
      getOwnPropertyDescriptor(_t, key) {
        if (!isParameter(key)) return undefined;
        return { value: params.get(key), writable: true, enumerable: true, configurable: true };
      },
      deleteProperty(_t, key) {
        if (typeof key === "string") params.delete(key);
        return true;
      },
    });

    return this.#self;
  }

  keys(): string[] {
    return [...this.#parameters.keys()];
  }

  isKey(key: string): boolean {
    return this.#parameters.isKey(key);
  }

  hasKey(key: string): boolean {
    return this.isKey(key);
  }

  isEmpty(): boolean {
    return this.#parameters.size === 0;
  }

  isPermitted(): boolean {
    return this.#permitted;
  }

  permitBang(): this {
    this.#permitted = true;
    return this.#self;
  }

  toH(): Hash<string, unknown> {
    return this.#parameters.toH();
  }

  toUnsafeH(): Hash<string, unknown> {
    return this.toH();
  }

  eachPair(block: (key: string, value: unknown) => void): this {
    for (const [key, value] of this.#parameters) block(key, value);
    return this.#self;
  }

  dup(): this {
    const duplicate = new ProtectedParams(this.#parameters);
    if (this.#permitted) duplicate.permitBang();
    return duplicate as this;
  }
}
