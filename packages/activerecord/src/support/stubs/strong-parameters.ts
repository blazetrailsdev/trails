export class ProtectedParams {
  [key: string]: unknown;

  #parameters: Record<string, unknown>;
  #permitted = false;
  #self: this;

  constructor(parameters: Record<string, unknown> = {}) {
    this.#parameters = { ...parameters };
    const params = this.#parameters;
    const target = this;
    const isParameter = (key: string | symbol): key is string =>
      typeof key === "string" &&
      Object.hasOwn(params, key) &&
      !Object.hasOwn(ProtectedParams.prototype, key);

    this.#self = new Proxy(this, {
      get(_t, key) {
        if (isParameter(key)) return params[key];
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set(_t, key, value) {
        if (typeof key === "string") params[key] = value;
        return true;
      },
      has(_t, key) {
        return isParameter(key) || Reflect.has(target, key);
      },
      ownKeys() {
        return Object.keys(params);
      },
      getOwnPropertyDescriptor(_t, key) {
        if (!isParameter(key)) return undefined;
        return { value: params[key], writable: true, enumerable: true, configurable: true };
      },
      deleteProperty(_t, key) {
        if (typeof key === "string") delete params[key];
        return true;
      },
    });

    return this.#self;
  }

  keys(): string[] {
    return Object.keys(this.#parameters);
  }

  isKey(key: string): boolean {
    return Object.hasOwn(this.#parameters, key);
  }

  hasKey(key: string): boolean {
    return this.isKey(key);
  }

  isEmpty(): boolean {
    return this.keys().length === 0;
  }

  permitted(): boolean {
    return this.#permitted;
  }

  permitBang(): this {
    this.#permitted = true;
    return this.#self;
  }

  toH(): Record<string, unknown> {
    return { ...this.#parameters };
  }

  toUnsafeH(): Record<string, unknown> {
    return this.toH();
  }

  eachPair(block: (key: string, value: unknown) => void): this {
    for (const [key, value] of Object.entries(this.#parameters)) block(key, value);
    return this.#self;
  }

  dup(): this {
    const duplicate = new ProtectedParams(this.#parameters);
    if (this.#permitted) duplicate.permitBang();
    return duplicate as this;
  }
}
