import { type HashWithIndifferentAccess, withIndifferentAccess } from "@blazetrails/activesupport";
import { type Hash, eachPair, isEmpty, keys } from "@blazetrails/ruby-compat";

export class ProtectedParams {
  [key: string]: unknown;

  static #targets = new WeakMap<ProtectedParams, ProtectedParams>();

  #parameters: HashWithIndifferentAccess;
  #permitted = false;
  #self: this;

  constructor(parameters: Record<string, unknown> = {}) {
    this.#parameters = withIndifferentAccess(parameters);
    const target = this;
    const isParameter = (key: string | symbol): key is string =>
      typeof key === "string" &&
      target.#parameters.isKey(key) &&
      !Object.hasOwn(ProtectedParams.prototype, key);

    this.#self = new Proxy(this, {
      get(_t, key) {
        if (isParameter(key)) return target.#parameters.get(key);
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set(_t, key, value) {
        if (typeof key === "string") target.#parameters.set(key, value);
        return true;
      },
      has(_t, key) {
        return isParameter(key) || Reflect.has(target, key);
      },
      ownKeys() {
        return keys(target.#parameters);
      },
      getOwnPropertyDescriptor(_t, key) {
        if (!isParameter(key)) return undefined;
        return {
          value: target.#parameters.get(key),
          writable: true,
          enumerable: true,
          configurable: true,
        };
      },
      deleteProperty(_t, key) {
        if (typeof key === "string") target.#parameters.delete(key);
        return true;
      },
    });

    ProtectedParams.#targets.set(this.#self, this);
    return this.#self;
  }

  keys(): string[] {
    return keys(this.#parameters);
  }

  isKey(key: string): boolean {
    return this.#parameters.isKey(key);
  }

  hasKey(key: string): boolean {
    return this.#parameters.hasKey(key);
  }

  isEmpty(): boolean {
    return isEmpty(this.#parameters);
  }

  isPermitted(): boolean {
    return this.#permitted;
  }

  permitBang(): this {
    this.#permitted = true;
    return this.#self;
  }

  toH(): Hash<string, unknown> | Record<string, unknown> {
    return this.#parameters.toH();
  }

  toUnsafeH(): Hash<string, unknown> | Record<string, unknown> {
    return this.toH();
  }

  eachPair(block: (key: string, value: unknown) => void): this {
    eachPair(this.#parameters, block);
    return this.#self;
  }

  dup(): this {
    const duplicate = new ProtectedParams();
    const target = ProtectedParams.#targets.get(duplicate)!;
    target.#parameters = this.#parameters;
    target.#permitted = this.#permitted;
    return duplicate as this;
  }
}
