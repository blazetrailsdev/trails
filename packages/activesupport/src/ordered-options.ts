import { presence } from "./core-ext/object/blank.js";
import { KeyError, rbObjClass } from "@blazetrails/ruby-compat";

export class OrderedOptions {
  static name = "ActiveSupport::OrderedOptions";

  private readonly data: Map<string, unknown>;

  protected defaultBlock?: (key: string) => unknown;

  constructor(defaultBlock?: (key: string) => unknown) {
    this.data = new Map();
    this.defaultBlock = defaultBlock;
    return new Proxy(this, {
      get(target, method: string | symbol) {
        if (typeof method === "symbol" || method in target) {
          const value = (target as any)[method];
          return typeof value === "function" ? value.bind(target) : value;
        }
        if (method.endsWith("!")) {
          const nameString = method.slice(0, -1);
          return () => {
            const value = presence(target.get(nameString));
            if (value === undefined) throw new KeyError(`:${nameString} is blank`);
            return value;
          };
        }
        return target.get(method);
      },
      set(target, method: string | symbol, value: unknown) {
        if (typeof method === "symbol" || method in target) {
          (target as any)[method] = value;
          return true;
        }
        target.set(method, value);
        return true;
      },
      has() {
        return true;
      },
    });
  }

  protected _get(key: string): unknown {
    if (this.data.has(key)) return this.data.get(key);
    return this.defaultBlock?.(key);
  }

  set(key: string, value: unknown): this {
    this.data.set(String(key), value);
    return this;
  }

  get(key: string): unknown {
    return this._get(String(key));
  }

  /**
   * Mirrors `dig` (ordered_options.rb:45-47), whose `super` is `rb_hash_dig`
   * (`vendor/ruby/hash.c:4627`): `rb_hash_aref` for the first key — which is
   * `get`, so the default block runs — and `rb_obj_dig`
   * (`vendor/ruby/object.c:3906`) for the rest. That loop ends on `nil`,
   * indexes a Hash through `rb_hash_aref` and an Array through `rb_ary_at`
   * — whose index goes through `NUM2LONG` (`vendor/ruby/array.c:1881-1883`),
   * so a String identifier is a TypeError there and not an index —
   * hands the remaining identifiers to an object that answers `dig`, and
   * otherwise raises `no_dig_method`'s TypeError (`object.c:3897-3900`). A
   * Ruby Hash is a plain object or a `Map` in trails, so both take the
   * `rb_hash_aref` arm.
   */
  dig(key: string, ...identifiers: (string | number)[]): unknown {
    let obj: unknown = this.get(String(key));
    for (let i = 0; i < identifiers.length; i++) {
      const identifier = identifiers[i];
      if (obj == null) return undefined;
      if (obj instanceof Map) {
        obj = obj.get(identifier);
        continue;
      }
      if (Array.isArray(obj)) {
        if (typeof identifier !== "number") {
          throw new TypeError(`no implicit conversion of ${rbObjClass(identifier)} into Integer`);
        }
        obj = obj[identifier < 0 ? obj.length + identifier : identifier];
        continue;
      }
      const proto: unknown = Object.getPrototypeOf(obj);
      if (proto === Object.prototype || proto === null) {
        obj = (obj as Record<string | number, unknown>)[identifier];
        continue;
      }
      const dig = (obj as { dig?: unknown }).dig;
      if (typeof dig === "function") {
        return (dig as (...args: (string | number)[]) => unknown).apply(obj, identifiers.slice(i));
      }
      throw new TypeError(`${rbObjClass(obj)} does not have #dig method`);
    }
    return obj;
  }

  isExtractableOptions(): boolean {
    return true;
  }

  inspect(): string {
    return `#<${this.constructor.name} ${this.toString()}>`;
  }

  toString(): string {
    const pairs = [...this.data.entries()].map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    return `{${pairs.join(", ")}}`;
  }

  isKey(key: string): boolean {
    return this.data.has(key);
  }

  key(value: unknown): string | undefined {
    for (const [k, v] of this.data) if (v === value) return k;
    return undefined;
  }

  clear(): this {
    this.data.clear();
    return this;
  }

  keys(): string[] {
    return [...this.data.keys()];
  }

  entries(): [string, unknown][] {
    const out: [string, unknown][] = [];
    this.each((key, value) => out.push([key, value]));
    return out;
  }

  toH(): Record<string, unknown> {
    return Object.fromEntries(this.data);
  }

  each(fn: (key: string, value: unknown) => void): this {
    for (const [k, v] of this.data) fn(k, v);
    return this;
  }

  get size(): number {
    return this.data.size;
  }

  get count(): number {
    return this.entries().length;
  }

  dup(): this {
    const copy = new (this.constructor as new (parent?: unknown) => this)(
      (this as unknown as { parent?: unknown }).parent,
    );
    for (const [key, value] of this.data) copy.set(key, value);
    if (copy.defaultBlock === undefined) copy.defaultBlock = this.defaultBlock;
    return copy;
  }
}

export class InheritableOptions extends OrderedOptions {
  static override name = "ActiveSupport::InheritableOptions";

  private readonly parent: OrderedOptions | Record<string, unknown>;

  constructor(parent: OrderedOptions | Record<string, unknown> | null = null) {
    if (parent instanceof OrderedOptions) {
      super((k) => (parent as unknown as { _get(key: string): unknown })._get(k));
      this.parent = parent;
    } else if (parent != null) {
      super((k) => parent[k]);
      this.parent = parent;
    } else {
      super();
      this.parent = {};
    }
  }

  override toH(): Record<string, unknown> {
    return { ...this.parentToH(), ...super.toH() };
  }

  override inspect(): string {
    return `#<${this.constructor.name} ${this.toString()}>`;
  }

  override toString(): string {
    const pairs = Object.entries(this.toH()).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    return `{${pairs.join(", ")}}`;
  }

  protected ownKey(key: string): boolean {
    return super.isKey(key);
  }

  override isKey(key: string): boolean {
    return super.isKey(key) || this.parentIsKey(key);
  }

  isOverridden(key: string): boolean {
    return !!(this.parent && this.parentIsKey(key) && this.ownKey(String(key)));
  }

  inheritableCopy(): InheritableOptions {
    return new (this.constructor as new (parent: OrderedOptions) => InheritableOptions)(this);
  }

  toA(): [string, unknown][] {
    return this.entries();
  }

  override each(fn: (key: string, value: unknown) => void): this {
    for (const [k, v] of Object.entries(this.toH())) fn(k, v);
    return this;
  }

  private parentToH(): Record<string, unknown> {
    return this.parent instanceof OrderedOptions ? this.parent.toH() : this.parent;
  }

  private parentIsKey(key: string): boolean {
    return this.parent instanceof OrderedOptions
      ? this.parent.isKey(key)
      : Object.prototype.hasOwnProperty.call(this.parent, key);
  }
}
