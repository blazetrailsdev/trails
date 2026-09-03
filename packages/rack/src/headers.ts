import { type DefaultProc, Hash } from "@blazetrails/ruby-compat";

export class Headers extends Hash<string, string> {
  constructor(defaultValue?: string | DefaultProc<string, string>) {
    super(defaultValue);
  }

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

  /** @internal */
  private downcaseKey(key: string): string {
    return typeof key === "string" ? key.toLowerCase() : String(key);
  }

  private _key(key: string): string {
    return this.downcaseKey(key);
  }

  override get(key: string): string | undefined {
    return super.get(this._key(key));
  }

  override set(key: string, value: string): this {
    super.set(this._key(key), value);
    return this;
  }

  store(key: string, value: string): this {
    return this.set(key, value);
  }

  override has(key: string): boolean {
    return super.has(this._key(key));
  }

  hasKey(key: string): boolean {
    return this.has(key);
  }

  override delete(key: string): string | undefined {
    return super.delete(this._key(key));
  }

  get length(): number {
    return this.size;
  }

  get empty(): boolean {
    return this.size === 0;
  }

  each(fn: (key: string, value: string) => void): void {
    for (const [k, v] of this) {
      fn(k, v);
    }
  }

  eachKey(fn: (key: string) => void): void {
    for (const k of this.keys()) {
      fn(k);
    }
  }

  eachValue(fn: (value: string) => void): void {
    for (const v of this.values()) {
      fn(v);
    }
  }

  valuesAt(...keys: string[]): (string | undefined | null)[] {
    return keys.map((k) => this.get(k));
  }

  toArray(): [string, string][] {
    return [...this.entries()];
  }

  toHash(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const [k, v] of this) {
      obj[k] = v;
    }
    return obj;
  }

  toH(): Record<string, string> {
    return this.toHash();
  }

  fetch(key: string, ...args: any[]): string {
    if (args.length > 1) throw new Error("ArgumentError: wrong number of arguments");
    const k = this._key(key);
    if (this.has(k)) return this.get(k)!;
    if (args.length === 1) {
      if (typeof args[0] === "function") return args[0](k);
      return args[0];
    }
    throw new Error(`IndexError: key not found: ${key}`);
  }

  fetchValues(...a: string[]): string[] {
    return a.map((k) => {
      const lk = this._key(k);
      if (!this.has(lk)) throw new Error(`KeyError: key not found: ${k}`);
      return this.get(lk)!;
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
    if (this.has(k)) return [k, this.get(k)!];
    return undefined;
  }

  rassoc(value: string): [string, string] | undefined {
    for (const [k, v] of this) {
      if (v === value) return [k, v];
    }
    return undefined;
  }

  key(value: string): string | undefined {
    for (const [k, v] of this) {
      if (v === value) return k;
    }
    return undefined;
  }

  hasValue(value: string): boolean {
    for (const v of this.values()) {
      if (v === value) return true;
    }
    return false;
  }

  merge(
    hash: Record<string, string> | Headers,
    fn?: (key: string, oldVal: string, newVal: string) => string,
  ): Headers {
    const result = this.dup();
    const entries = hash instanceof Headers ? hash.toArray() : Object.entries(hash);
    for (const [k, v] of entries) {
      const lk = result._key(k);
      if (fn && result.has(lk)) {
        result.set(lk, fn(lk, result.get(lk)!, v));
      } else {
        result.set(lk, v);
      }
    }
    return result;
  }

  mergeInPlace(
    hash: Record<string, string> | Headers,
    fn?: (key: string, oldVal: string, newVal: string) => string,
  ): Headers {
    const entries = hash instanceof Headers ? hash.toArray() : Object.entries(hash);
    for (const [k, v] of entries) {
      const lk = this._key(k);
      if (fn && this.has(lk)) {
        this.set(lk, fn(lk, this.get(lk)!, v));
      } else {
        this.set(lk, v);
      }
    }
    return this;
  }

  update(
    hash: Record<string, string> | Headers,
    fn?: (key: string, oldVal: string, newVal: string) => string,
  ): Headers {
    return this.mergeInPlace(hash, fn);
  }

  replace(hash: Record<string, string> | Headers): Headers {
    this.clear();
    return this.update(hash);
  }

  select(fn: (key: string, value: string) => boolean): Headers {
    const result = new Headers();
    for (const [k, v] of this) {
      if (fn(k, v)) result.set(k, v);
    }
    return result;
  }

  selectInPlace(fn: (key: string, value: string) => boolean): Headers | null {
    let changed = false;
    for (const [k, v] of [...this]) {
      if (!fn(k, v)) {
        this.delete(k);
        changed = true;
      }
    }
    return changed ? this : null;
  }

  reject(fn: (key: string, value: string) => boolean): Headers {
    const result = new Headers();
    for (const [k, v] of this) {
      if (!fn(k, v)) result.set(k, v);
    }
    return result;
  }

  rejectInPlace(fn: (key: string, value: string) => boolean): Headers | null {
    let changed = false;
    for (const [k, v] of [...this]) {
      if (fn(k, v)) {
        this.delete(k);
        changed = true;
      }
    }
    return changed ? this : null;
  }

  deleteIf(fn: (key: string, value: string) => boolean): Headers {
    for (const [k, v] of [...this]) {
      if (fn(k, v)) this.delete(k);
    }
    return this;
  }

  keepIf(fn: (key: string, value: string) => boolean): Headers {
    for (const [k, v] of [...this]) {
      if (!fn(k, v)) this.delete(k);
    }
    return this;
  }

  compact(): Headers {
    const result = new Headers();
    for (const [k, v] of this) {
      if (v != null) result.set(k, v);
    }
    return result;
  }

  compactInPlace(): Headers | null {
    let changed = false;
    for (const [k, v] of [...this]) {
      if (v == null) {
        this.delete(k);
        changed = true;
      }
    }
    return changed ? this : null;
  }

  slice(...a: string[]): Headers {
    const result = new Headers();
    for (const key of a) {
      const k = this._key(key);
      if (this.has(k)) result.set(k, this.get(k)!);
    }
    return result;
  }

  except(...a: string[]): Headers {
    const exclude = new Set(a.map((k) => this._key(k)));
    const result = new Headers();
    for (const [k, v] of this) {
      if (!exclude.has(k)) result.set(k, v);
    }
    return result;
  }

  transformValues(fn: (value: string) => string): Headers {
    const result = new Headers();
    for (const [k, v] of this) {
      result.set(k, fn(v));
    }
    return result;
  }

  transformValuesInPlace(fn: (value: string) => string): Headers {
    for (const [k, v] of this) {
      this.set(k, fn(v));
    }
    return this;
  }

  transformKeys(fn: (key: string) => string): Headers {
    const result = new Headers();
    for (const [k, v] of this) {
      result.set(result._key(fn(k)), v);
    }
    return result;
  }

  transformKeysInPlace(fn: (key: string) => string): Headers {
    const entries = [...this];
    this.clear();
    for (const [k, v] of entries) {
      this.set(this._key(fn(k)), v);
    }
    return this;
  }

  transformKeysBang(fn: (key: string) => string): Headers {
    return this.transformKeysInPlace(fn);
  }

  invert(): Headers {
    const result = new Headers();
    for (const [k, v] of this) {
      result.set(result._key(v), k);
    }
    return result;
  }

  flatten(_depth = 1): string[] {
    const result: string[] = [];
    for (const [k, v] of this) {
      result.push(k, v);
    }
    return result;
  }

  sort(fn?: (a: [string, string], b: [string, string]) => number): [string, string][] {
    const arr = this.toArray();
    return fn ? arr.sort(fn) : arr.sort((a, b) => a[0].localeCompare(b[0]));
  }

  shift(): [string, string] | undefined {
    const first = this.entries().next();
    if (first.done) return undefined;
    this.delete(first.value[0]);
    return first.value;
  }

  dup(): Headers {
    const h = new Headers();
    if (this.defaultProc()) h.setDefaultProc(this.defaultProc());
    else h.setDefault(this.default());
    for (const [k, v] of this) {
      h.set(k, v);
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
    if (this.size === 0) return "{}";
    const pairs = [...this].map(([k, v]) => `"${k}"=>"${v}"`);
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
