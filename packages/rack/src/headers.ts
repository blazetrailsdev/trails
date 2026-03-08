/**
 * Rack::Headers
 *
 * A case-insensitive hash for HTTP headers. All keys are downcased on storage.
 * Implements the same interface as Ruby's Hash so it can be used as a drop-in
 * replacement in Rack middleware.
 */

export class Headers {
  private _data: Map<string, string> = new Map();
  private _default: string | undefined;
  private _defaultProc: ((h: Headers, key: string) => string | null) | undefined;

  constructor(defaultValue?: string | ((h: Headers, key: string) => string | null)) {
    if (typeof defaultValue === "function") {
      this._defaultProc = defaultValue;
    } else {
      this._default = defaultValue;
    }
  }

  /**
   * Create a Headers from key-value pairs.
   * Headers.from({ "Content-Type": "text/html" })
   * Headers.from("Content-Type", "text/html", "Accept", "application/json")
   */
  static from(...args: any[]): Headers {
    const h = new Headers();
    if (args.length === 0) return h;
    if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
      for (const [k, v] of Object.entries(args[0])) {
        h.set(k, v as string);
      }
      return h;
    }
    if (args.length % 2 !== 0) {
      throw new Error("ArgumentError: odd number of arguments for Headers");
    }
    for (let i = 0; i < args.length; i += 2) {
      h.set(String(args[i]), args[i + 1]);
    }
    return h;
  }

  private _key(key: string): string {
    return typeof key === "string" ? key.toLowerCase() : String(key);
  }

  // --- Core accessors ---

  get(key: string): string | undefined | null {
    const k = this._key(key);
    if (this._data.has(k)) return this._data.get(k)!;
    if (this._defaultProc) return this._defaultProc(this, k);
    if (this._default !== undefined) return this._default;
    return undefined;
  }

  set(key: string, value: string): string {
    this._data.set(this._key(key), value);
    return value;
  }

  store(key: string, value: string): string {
    return this.set(key, value);
  }

  has(key: string): boolean {
    return this._data.has(this._key(key));
  }

  delete(key: string): string | undefined {
    const k = this._key(key);
    const val = this._data.get(k);
    this._data.delete(k);
    return val;
  }

  clear(): void {
    this._data.clear();
  }

  get size(): number {
    return this._data.size;
  }

  get length(): number {
    return this._data.size;
  }

  get empty(): boolean {
    return this._data.size === 0;
  }

  // --- Default ---

  get default(): string | undefined {
    return this._default ?? undefined;
  }

  set default(val: string | undefined) {
    this._default = val;
    this._defaultProc = undefined;
  }

  get defaultProc(): ((h: Headers, key: string) => string | null) | undefined {
    return this._defaultProc;
  }

  set defaultProc(fn: ((h: Headers, key: string) => string | null) | undefined) {
    this._defaultProc = fn;
    this._default = undefined;
  }

  // --- Iteration ---

  forEach(fn: (key: string, value: string) => void): void {
    for (const [k, v] of this._data) {
      fn(k, v);
    }
  }

  each(fn: (key: string, value: string) => void): void {
    this.forEach(fn);
  }

  eachKey(fn: (key: string) => void): void {
    for (const k of this._data.keys()) {
      fn(k);
    }
  }

  eachValue(fn: (value: string) => void): void {
    for (const v of this._data.values()) {
      fn(v);
    }
  }

  // --- Keys/Values ---

  keys(): string[] {
    return [...this._data.keys()];
  }

  values(): string[] {
    return [...this._data.values()];
  }

  valuesAt(...keys: string[]): (string | undefined | null)[] {
    return keys.map((k) => this.get(k));
  }

  // --- Conversion ---

  toArray(): [string, string][] {
    return [...this._data.entries()];
  }

  toHash(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const [k, v] of this._data) {
      obj[k] = v;
    }
    return obj;
  }

  toH(): Record<string, string> {
    return this.toHash();
  }

  // --- Searching ---

  fetch(key: string, ...args: any[]): string {
    if (args.length > 1) throw new Error("ArgumentError: wrong number of arguments");
    const k = this._key(key);
    if (this._data.has(k)) return this._data.get(k)!;
    if (args.length === 1) {
      if (typeof args[0] === "function") return args[0](k);
      return args[0];
    }
    throw new Error(`IndexError: key not found: ${key}`);
  }

  fetchValues(...keys: string[]): string[] {
    return keys.map((k) => {
      const lk = this._key(k);
      if (!this._data.has(lk)) throw new Error(`KeyError: key not found: ${k}`);
      return this._data.get(lk)!;
    });
  }

  dig(key: string, ...rest: any[]): string | undefined | null {
    const val = this.get(key);
    if (rest.length === 0) return val;
    if (val === undefined || val === null) return undefined;
    throw new TypeError("String does not have #dig method");
  }

  assoc(key: string): [string, string] | undefined {
    const k = this._key(key);
    if (this._data.has(k)) return [k, this._data.get(k)!];
    return undefined;
  }

  rassoc(value: string): [string, string] | undefined {
    for (const [k, v] of this._data) {
      if (v === value) return [k, v];
    }
    return undefined;
  }

  key(value: string): string | undefined {
    for (const [k, v] of this._data) {
      if (v === value) return k;
    }
    return undefined;
  }

  hasValue(value: string): boolean {
    for (const v of this._data.values()) {
      if (v === value) return true;
    }
    return false;
  }

  // --- Mutation ---

  merge(other: Record<string, string> | Headers, fn?: (key: string, oldVal: string, newVal: string) => string): Headers {
    const result = this.dup();
    const entries = other instanceof Headers ? other.toArray() : Object.entries(other);
    for (const [k, v] of entries) {
      const lk = result._key(k);
      if (fn && result._data.has(lk)) {
        result._data.set(lk, fn(lk, result._data.get(lk)!, v));
      } else {
        result._data.set(lk, v);
      }
    }
    return result;
  }

  mergeInPlace(other: Record<string, string> | Headers, fn?: (key: string, oldVal: string, newVal: string) => string): Headers {
    const entries = other instanceof Headers ? other.toArray() : Object.entries(other);
    for (const [k, v] of entries) {
      const lk = this._key(k);
      if (fn && this._data.has(lk)) {
        this._data.set(lk, fn(lk, this._data.get(lk)!, v));
      } else {
        this._data.set(lk, v);
      }
    }
    return this;
  }

  update(other: Record<string, string> | Headers, fn?: (key: string, oldVal: string, newVal: string) => string): Headers {
    return this.mergeInPlace(other, fn);
  }

  replace(other: Record<string, string> | Headers): Headers {
    this._data.clear();
    const entries = other instanceof Headers ? other.toArray() : Object.entries(other);
    for (const [k, v] of entries) {
      this._data.set(this._key(k), v);
    }
    return this;
  }

  // --- Filtering ---

  select(fn: (key: string, value: string) => boolean): Headers {
    const result = new Headers();
    for (const [k, v] of this._data) {
      if (fn(k, v)) result._data.set(k, v);
    }
    return result;
  }

  selectInPlace(fn: (key: string, value: string) => boolean): Headers | null {
    let changed = false;
    for (const [k, v] of [...this._data]) {
      if (!fn(k, v)) {
        this._data.delete(k);
        changed = true;
      }
    }
    return changed ? this : null;
  }

  reject(fn: (key: string, value: string) => boolean): Headers {
    const result = new Headers();
    for (const [k, v] of this._data) {
      if (!fn(k, v)) result._data.set(k, v);
    }
    return result;
  }

  rejectInPlace(fn: (key: string, value: string) => boolean): Headers | null {
    let changed = false;
    for (const [k, v] of [...this._data]) {
      if (fn(k, v)) {
        this._data.delete(k);
        changed = true;
      }
    }
    return changed ? this : null;
  }

  deleteIf(fn: (key: string, value: string) => boolean): Headers {
    for (const [k, v] of [...this._data]) {
      if (fn(k, v)) this._data.delete(k);
    }
    return this;
  }

  keepIf(fn: (key: string, value: string) => boolean): Headers {
    for (const [k, v] of [...this._data]) {
      if (!fn(k, v)) this._data.delete(k);
    }
    return this;
  }

  compact(): Headers {
    const result = new Headers();
    for (const [k, v] of this._data) {
      if (v != null) result._data.set(k, v);
    }
    return result;
  }

  compactInPlace(): Headers | null {
    let changed = false;
    for (const [k, v] of [...this._data]) {
      if (v == null) {
        this._data.delete(k);
        changed = true;
      }
    }
    return changed ? this : null;
  }

  slice(...keys: string[]): Headers {
    const result = new Headers();
    for (const key of keys) {
      const k = this._key(key);
      if (this._data.has(k)) result._data.set(k, this._data.get(k)!);
    }
    return result;
  }

  except(...keys: string[]): Headers {
    const exclude = new Set(keys.map((k) => this._key(k)));
    const result = new Headers();
    for (const [k, v] of this._data) {
      if (!exclude.has(k)) result._data.set(k, v);
    }
    return result;
  }

  // --- Transform ---

  transformValues(fn: (value: string) => string): Headers {
    const result = new Headers();
    for (const [k, v] of this._data) {
      result._data.set(k, fn(v));
    }
    return result;
  }

  transformValuesInPlace(fn: (value: string) => string): Headers {
    for (const [k, v] of this._data) {
      this._data.set(k, fn(v));
    }
    return this;
  }

  transformKeys(fn: (key: string) => string): Headers {
    const result = new Headers();
    for (const [k, v] of this._data) {
      result._data.set(result._key(fn(k)), v);
    }
    return result;
  }

  transformKeysInPlace(fn: (key: string) => string): Headers {
    const entries = [...this._data];
    this._data.clear();
    for (const [k, v] of entries) {
      this._data.set(this._key(fn(k)), v);
    }
    return this;
  }

  invert(): Headers {
    const result = new Headers();
    for (const [k, v] of this._data) {
      result._data.set(result._key(v), k);
    }
    return result;
  }

  // --- Other ---

  flatten(depth = 1): string[] {
    const result: string[] = [];
    for (const [k, v] of this._data) {
      result.push(k, v);
    }
    return result;
  }

  sort(fn?: (a: [string, string], b: [string, string]) => number): [string, string][] {
    const arr = this.toArray();
    return fn ? arr.sort(fn) : arr.sort((a, b) => a[0].localeCompare(b[0]));
  }

  shift(): [string, string] | undefined {
    const first = this._data.entries().next();
    if (first.done) return undefined;
    this._data.delete(first.value[0]);
    return first.value;
  }

  dup(): Headers {
    const h = new Headers();
    h._default = this._default;
    h._defaultProc = this._defaultProc;
    for (const [k, v] of this._data) {
      h._data.set(k, v);
    }
    return h;
  }

  equals(other: Headers | Record<string, string>): boolean {
    const otherEntries = other instanceof Headers ? other.toHash() : other;
    const thisHash = this.toHash();
    const thisKeys = Object.keys(thisHash);
    const otherKeys = Object.keys(otherEntries);
    if (thisKeys.length !== otherKeys.length) return false;
    for (const k of thisKeys) {
      if (thisHash[k] !== otherEntries[k]) return false;
    }
    return true;
  }

  inspect(): string {
    if (this._data.size === 0) return "{}";
    const pairs = [...this._data].map(([k, v]) => `"${k}"=>"${v}"`);
    return `{${pairs.join(", ")}}`;
  }

  toString(): string {
    return this.inspect();
  }

  toProc(): (key: string) => string | undefined | null {
    return (key: string) => this.get(key);
  }

  compareByIdentity(): never {
    throw new TypeError("Headers cannot compare by identity");
  }

  get compareByIdentityQ(): boolean {
    return false;
  }

  deconstructKeys(): Headers {
    return this.dup();
  }
}
