/**
 * ActionController::Parameters (Strong Parameters)
 *
 * A hash-like object that controls which parameters are permitted
 * for mass assignment.
 */

export class Parameters {
  private _data: Record<string, unknown>;
  private _permitted = false;

  constructor(data: Record<string, unknown> = {}) {
    this._data = { ...data };
  }

  // --- Permit / require ---

  get permitted(): boolean {
    return this._permitted;
  }

  permit(...keys: (string | Record<string, unknown>)[]): Parameters {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key === "string") {
        if (key in this._data) {
          result[key] = this._data[key];
        }
      } else {
        // Hash form: { posts: [:title, :body] }
        for (const [k, v] of Object.entries(key)) {
          if (k in this._data) {
            const val = this._data[k];
            if (val instanceof Parameters) {
              if (Array.isArray(v)) {
                result[k] = val.permit(...(v as string[]));
              } else {
                result[k] = val;
              }
            } else if (Array.isArray(val)) {
              if (Array.isArray(v)) {
                // Array of hashes — permit each
                result[k] = val.map((item) => {
                  if (item instanceof Parameters) {
                    return item.permit(...(v as string[]));
                  }
                  return item;
                });
              } else {
                result[k] = val;
              }
            } else {
              result[k] = val;
            }
          }
        }
      }
    }
    const p = new Parameters(result);
    p._permitted = true;
    return p;
  }

  permitAll(): Parameters {
    const p = new Parameters({ ...this._data });
    p._permitted = true;
    return p;
  }

  require(key: string): unknown {
    if (!(key in this._data)) {
      throw new ParameterMissing(key);
    }
    const val = this._data[key];
    if (val === null || val === undefined || val === "") {
      throw new ParameterMissing(key);
    }
    return val;
  }

  // --- Hash-like accessors ---

  get(key: string): unknown {
    return this._data[key];
  }

  set(key: string, value: unknown): void {
    this._data[key] = value;
  }

  has(key: string): boolean {
    return key in this._data;
  }

  hasKey(key: string): boolean {
    return key in this._data;
  }

  hasValue(value: unknown): boolean {
    return Object.values(this._data).includes(value);
  }

  include(key: string): boolean {
    return key in this._data;
  }

  member(key: string): boolean {
    return key in this._data;
  }

  exclude(key: string): boolean {
    return !(key in this._data);
  }

  get keys(): string[] {
    return Object.keys(this._data);
  }

  get values(): unknown[] {
    return Object.values(this._data);
  }

  get empty(): boolean {
    return Object.keys(this._data).length === 0;
  }

  get length(): number {
    return Object.keys(this._data).length;
  }

  get size(): number {
    return this.length;
  }

  // --- Transformations ---

  except(...keys: string[]): Parameters {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this._data)) {
      if (!keys.includes(k)) result[k] = v;
    }
    const p = new Parameters(result);
    p._permitted = this._permitted;
    return p;
  }

  without(...keys: string[]): Parameters {
    return this.except(...keys);
  }

  slice(...keys: string[]): Parameters {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in this._data) result[key] = this._data[key];
    }
    const p = new Parameters(result);
    p._permitted = this._permitted;
    return p;
  }

  extract(...keys: string[]): Parameters {
    return this.slice(...keys);
  }

  merge(other: Parameters | Record<string, unknown>): Parameters {
    const otherData = other instanceof Parameters ? other.toHash() : other;
    const p = new Parameters({ ...this._data, ...otherData });
    p._permitted = this._permitted;
    return p;
  }

  reversemerge(other: Parameters | Record<string, unknown>): Parameters {
    const otherData = other instanceof Parameters ? other.toHash() : other;
    const p = new Parameters({ ...otherData, ...this._data });
    p._permitted = this._permitted;
    return p;
  }

  transform(fn: (key: string, value: unknown) => unknown): Parameters {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this._data)) {
      result[k] = fn(k, v);
    }
    const p = new Parameters(result);
    p._permitted = this._permitted;
    return p;
  }

  transformKeys(fn: (key: string) => string): Parameters {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this._data)) {
      result[fn(k)] = v;
    }
    const p = new Parameters(result);
    p._permitted = this._permitted;
    return p;
  }

  transformValues(fn: (value: unknown) => unknown): Parameters {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this._data)) {
      result[k] = fn(v);
    }
    const p = new Parameters(result);
    p._permitted = this._permitted;
    return p;
  }

  select(fn: (key: string, value: unknown) => boolean): Parameters {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this._data)) {
      if (fn(k, v)) result[k] = v;
    }
    const p = new Parameters(result);
    p._permitted = this._permitted;
    return p;
  }

  reject(fn: (key: string, value: unknown) => boolean): Parameters {
    return this.select((k, v) => !fn(k, v));
  }

  compact(): Parameters {
    return this.select((_k, v) => v !== null && v !== undefined);
  }

  compactBlank(): Parameters {
    return this.select((_k, v) => v !== null && v !== undefined && v !== "" && v !== false);
  }

  // --- Iteration ---

  each(fn: (key: string, value: unknown) => void): this {
    for (const [k, v] of Object.entries(this._data)) {
      fn(k, v);
    }
    return this;
  }

  eachPair(fn: (key: string, value: unknown) => void): this {
    return this.each(fn);
  }

  eachValue(fn: (value: unknown) => void): this {
    for (const v of Object.values(this._data)) {
      fn(v);
    }
    return this;
  }

  eachKey(fn: (key: string) => void): this {
    for (const k of Object.keys(this._data)) {
      fn(k);
    }
    return this;
  }

  // --- Fetch ---

  fetch(key: string, defaultValue?: unknown): unknown {
    if (key in this._data) return this._data[key];
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`key not found: "${key}"`);
  }

  dig(...keys: string[]): unknown {
    let current: unknown = this._data;
    for (const key of keys) {
      if (current === null || current === undefined) return undefined;
      if (current instanceof Parameters) {
        current = current.get(key);
      } else if (typeof current === "object") {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    return current;
  }

  // --- Conversion ---

  toHash(): Record<string, unknown> {
    return { ...this._data };
  }

  toJSON(): Record<string, unknown> {
    return this.toHash();
  }

  toUnsafeHash(): Record<string, unknown> {
    return this.toHash();
  }

  toString(): string {
    return JSON.stringify(this._data);
  }

  inspect(): string {
    const permitted = this._permitted ? " permitted: true" : "";
    return `#<ActionController::Parameters ${JSON.stringify(this._data)}${permitted}>`;
  }

  // --- Deep operations ---

  deepDup(): Parameters {
    const p = new Parameters(structuredClone(this._data));
    p._permitted = this._permitted;
    return p;
  }

  // --- Delete ---

  delete(key: string): unknown {
    const val = this._data[key];
    delete this._data[key];
    return val;
  }

  // --- Static ---

  static create(data: Record<string, unknown> = {}): Parameters {
    return new Parameters(data);
  }
}

export class ParameterMissing extends Error {
  readonly param: string;

  constructor(param: string) {
    super(`param is missing or the value is empty: ${param}`);
    this.name = "ParameterMissing";
    this.param = param;
  }
}
