/**
 * Mirrors: ActiveSupport::OrderedOptions
 * (activesupport/lib/active_support/ordered_options.rb).
 *
 * Rails' class is `OrderedOptions < Hash`, so every Hash method IS the API and
 * the class itself overrides only `[]=`, `[]`, `dig`, `method_missing`,
 * `respond_to_missing?`, `extractable_options?` and `inspect`
 * (ordered_options.rb:33-70). TypeScript has no Hash to subclass, so — exactly
 * as `HashWithIndifferentAccess` does — the Hash storage is a private `Map` and
 * the Hash members this class is actually used through are spelled by
 * docs/ruby-ts-conventions.md (`[]` → `get`, `[]=` → `set`, `key?` → `isKey`).
 *
 * `method_missing` is a `Proxy`: property reads and writes that do not name a
 * member fall through to the Hash, which is what makes `opts.boy = "John"`
 * work.
 */

import { presence } from "./core-ext/object/blank.js";
import { KeyError } from "./core-ext/key-error.js";

export class OrderedOptions {
  private readonly data: Map<string, unknown>;

  /**
   * Ruby's Hash default block (`Hash.new { |h, k| … }`), the hook
   * `InheritableOptions` hands its parent lookup to (ordered_options.rb:90-99).
   * Only the un-overridden read (`_get`) consults it, as in Ruby.
   */
  protected defaultBlock?: (key: string) => unknown;

  /**
   * `Hash.new` — Rails' `OrderedOptions < Hash` inherits it untouched, so it
   * takes no entries; a subclass hands it a default block instead
   * (ordered_options.rb:89-99).
   */
  constructor(defaultBlock?: (key: string) => unknown) {
    this.data = new Map();
    this.defaultBlock = defaultBlock;
    return new Proxy(this, {
      // Mirrors `method_missing` (ordered_options.rb:49-58) and
      // `respond_to_missing?` (:60-62), which answers true for every name.
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
      has(target, method: string | symbol) {
        if (typeof method === "symbol" || method in target) return true;
        return target.isKey(method);
      },
    });
  }

  /**
   * Mirrors `alias_method :_get, :[]` (ordered_options.rb:34-35) — the
   * original, un-overridden Hash read, kept so `InheritableOptions` can reach a
   * parent's own storage without going through the subclass's `[]`. Being the
   * Hash read, it is the one that runs the default block.
   */
  protected _get(key: string): unknown {
    if (this.data.has(key)) return this.data.get(key);
    return this.defaultBlock?.(key);
  }

  /** Mirrors `[]=` (ordered_options.rb:37-39). */
  set(key: string, value: unknown): this {
    this.data.set(String(key), value);
    return this;
  }

  /** Mirrors `[]` (ordered_options.rb:41-43). */
  get(key: string): unknown {
    return this._get(String(key));
  }

  /** Mirrors `dig` (ordered_options.rb:45-47). */
  dig(key: string, ...identifiers: string[]): unknown {
    let value = this.get(String(key));
    for (const identifier of identifiers) {
      if (value == null || typeof value !== "object") return undefined;
      value = (value as any)[identifier];
    }
    return value;
  }

  /** Mirrors `extractable_options?` (ordered_options.rb:64-66). */
  isExtractableOptions(): boolean {
    return true;
  }

  /** Mirrors `inspect` (ordered_options.rb:68-70). */
  inspect(): string {
    const pairs = [...this.data.entries()].map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    return `#<${this.constructor.name} {${pairs.join(", ")}}>`;
  }

  toString(): string {
    return this.inspect();
  }

  // -- Hash members, which Rails inherits rather than defining --

  /** `Hash#key?` — the un-overridden membership test. */
  isKey(key: string): boolean {
    return this.data.has(key);
  }

  /** `Hash#key` — the first key holding `value`. */
  key(value: unknown): string | undefined {
    for (const [k, v] of this.data) if (v === value) return k;
    return undefined;
  }

  /** `Hash#keys`. */
  keys(): string[] {
    return [...this.data.keys()];
  }

  /**
   * `Enumerable#entries` — Ruby builds it on `each`, not on the Hash storage,
   * which is why `InheritableOptions`'s `each` override (ordered_options.rb:142-145)
   * makes it answer the parent-merged pairs.
   */
  entries(): [string, unknown][] {
    const out: [string, unknown][] = [];
    this.each((key, value) => out.push([key, value]));
    return out;
  }

  /** `Hash#to_h`. */
  toH(): Record<string, unknown> {
    return Object.fromEntries(this.data);
  }

  /** `Hash#each`. */
  each(fn: (key: string, value: unknown) => void): this {
    for (const [k, v] of this.data) fn(k, v);
    return this;
  }

  /** `Hash#size` — the own-entry count, unlike `Enumerable#count`. */
  get size(): number {
    return this.data.size;
  }

  /** `Enumerable#count` — like `entries`, counted through `each`. */
  get count(): number {
    return this.entries().length;
  }

  /**
   * `Object#dup` — allocates the receiver's OWN class and copies its ivars, so
   * an `InheritableOptions` dup stays an `InheritableOptions` reading through
   * the same parent (`Hash#dup` carries the default block over too).
   */
  dup(): this {
    const copy = new (this.constructor as new (parent?: unknown) => this)(
      (this as unknown as { parent?: unknown }).parent,
    );
    for (const [key, value] of this.data) copy.set(key, value);
    if (copy.defaultBlock === undefined) copy.defaultBlock = this.defaultBlock;
    return copy;
  }
}

/**
 * Mirrors: ActiveSupport::InheritableOptions (ordered_options.rb:88-146).
 *
 * The parent lookup is Rails' Hash default block, not a hand-written read
 * override: the constructor installs `defaultBlock`, so the un-overridden
 * `_get` finds the parent's value exactly where Ruby's Hash does — and, as
 * Rails documents at ordered_options.rb:92, an `OrderedOptions` parent is read
 * through the faster `_get`.
 */
export class InheritableOptions extends OrderedOptions {
  private readonly parent: OrderedOptions | Record<string, unknown>;

  /**
   * Mirrors `initialize(parent = nil)` (ordered_options.rb:89-99) — an
   * `OrderedOptions` parent is read through the faster `_get`, any other hash
   * through `[]`, and a nil parent leaves an empty hash behind.
   */
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

  /** Mirrors `to_h` (ordered_options.rb:100-102). */
  override toH(): Record<string, unknown> {
    return { ...this.parentToH(), ...super.toH() };
  }

  /** Mirrors `inspect` (ordered_options.rb:108-110). */
  override inspect(): string {
    const pairs = Object.entries(this.toH()).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    return `#<${this.constructor.name} {${pairs.join(", ")}}>`;
  }

  /** Mirrors `to_s` (ordered_options.rb:112-114). */
  override toString(): string {
    return this.inspect();
  }

  /**
   * Mirrors `alias_method :own_key?, :key?` (ordered_options.rb:123-124) — the
   * un-overridden `key?`, which sees only this object's own entries.
   */
  protected ownKey(key: string): boolean {
    return super.isKey(key);
  }

  /** Mirrors `key?` (ordered_options.rb:126-128). */
  override isKey(key: string): boolean {
    return super.isKey(key) || this.parentIsKey(key);
  }

  /** Mirrors `overridden?` (ordered_options.rb:130-132). */
  isOverridden(key: string): boolean {
    return !!(this.parent && this.parentIsKey(key) && this.ownKey(String(key)));
  }

  /** Mirrors `inheritable_copy` (ordered_options.rb:134-136). */
  inheritableCopy(): InheritableOptions {
    return new InheritableOptions(this);
  }

  /** Mirrors `to_a` (ordered_options.rb:138-140). */
  toA(): [string, unknown][] {
    return this.entries();
  }

  /** Mirrors `each` (ordered_options.rb:142-145). */
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
