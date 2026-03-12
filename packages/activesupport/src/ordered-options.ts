/**
 * ActiveSupport::OrderedOptions
 *
 * A Hash-like object that supports method_missing access (get/set via property names).
 * Commonly used for Rails configuration objects.
 *
 * Rails:
 *   opts = ActiveSupport::OrderedOptions.new
 *   opts.boy = "John"
 *   opts.boy        # => "John"
 *   opts.girl?      # => false
 *   opts.key?(:boy) # => true
 *
 * TypeScript uses a Proxy to support arbitrary property access.
 */

export class OrderedOptions {
  private readonly _data: Map<string, unknown>;

  constructor(initial: Record<string, unknown> = {}) {
    this._data = new Map(Object.entries(initial));
    return new Proxy(this, {
      get(target, prop: string | symbol) {
        if (typeof prop === "symbol" || prop in target) {
          const val = (target as any)[prop];
          return typeof val === "function" ? val.bind(target) : val;
        }
        // <key>? → boolean presence check
        if (prop.endsWith("?")) {
          const key = prop.slice(0, -1);
          return () => {
            const v = target._data.get(key);
            return v !== undefined && v !== null && v !== false && v !== "";
          };
        }
        // <key>! → value or throw
        if (prop.endsWith("!")) {
          const key = prop.slice(0, -1);
          return () => {
            const v = target._data.get(key);
            if (v === undefined || v === null) {
              throw new Error(`:${key} is blank`);
            }
            return v;
          };
        }
        return target._data.get(prop);
      },
      set(target, prop: string | symbol, value: unknown) {
        if (typeof prop === "symbol" || prop in target) {
          (target as any)[prop] = value;
          return true;
        }
        target._data.set(prop as string, value);
        return true;
      },
      has(target, prop: string | symbol) {
        if (typeof prop === "symbol" || prop in target) return true;
        return target._data.has(prop as string);
      },
    });
  }

  // -------------------------------------------------------------------------
  // Hash-like interface
  // -------------------------------------------------------------------------

  get(key: string): unknown {
    return this._data.get(key);
  }
  set(key: string, value: unknown): this {
    this._data.set(key, value);
    return this;
  }
  key(value: unknown): string | undefined {
    for (const [k, v] of this._data) if (v === value) return k;
    return undefined;
  }
  has(key: string): boolean {
    return this._data.has(key);
  }
  delete(key: string): boolean {
    return this._data.delete(key);
  }
  keys(): string[] {
    return [...this._data.keys()];
  }
  values(): unknown[] {
    return [...this._data.values()];
  }
  entries(): [string, unknown][] {
    return [...this._data.entries()];
  }
  toObject(): Record<string, unknown> {
    return Object.fromEntries(this._data);
  }
  toH(): Record<string, unknown> {
    return this.toObject();
  }

  /** dig — nested key lookup */
  dig(...keys: string[]): unknown {
    let val: unknown = this.toObject();
    for (const key of keys) {
      if (val == null || typeof val !== "object") return undefined;
      val = (val as any)[key];
    }
    return val;
  }

  /** each — iterate over key/value pairs */
  each(fn: (key: string, value: unknown) => void): void {
    for (const [k, v] of this._data) fn(k, v);
  }

  get count(): number {
    return this._data.size;
  }
  get size(): number {
    return this._data.size;
  }

  /** inspect — like Ruby's inspect */
  inspect(): string {
    const pairs = [...this._data.entries()].map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    return `#<OrderedOptions {${pairs.join(", ")}}>`;
  }

  toString(): string {
    return this.inspect();
  }

  /** dup — shallow copy */
  dup(): OrderedOptions {
    return new OrderedOptions(this.toObject());
  }
}

/**
 * InheritableOptions — like OrderedOptions but falls through to a parent.
 */
export class InheritableOptions extends OrderedOptions {
  private readonly _parent: OrderedOptions | null;

  constructor(parent: OrderedOptions | null = null, initial: Record<string, unknown> = {}) {
    super(initial);
    this._parent = parent;
    const self = this;
    return new Proxy(this, {
      get(target, prop: string | symbol) {
        if (
          typeof prop === "symbol" ||
          prop in OrderedOptions.prototype ||
          prop in InheritableOptions.prototype
        ) {
          const val = (target as any)[prop];
          return typeof val === "function" ? val.bind(target) : val;
        }
        const strProp = prop as string;
        if (strProp.endsWith("?")) {
          const key = strProp.slice(0, -1);
          return () => {
            const local = (target as any)._data.get(key);
            if (local !== undefined) return local !== null && local !== false && local !== "";
            if (self._parent) return (self._parent as any)._data.get(key) !== undefined;
            return false;
          };
        }
        if (strProp.endsWith("!")) {
          const key = strProp.slice(0, -1);
          return () => {
            const v = (target as any)._data.get(key) ?? self._parent?.get(key);
            if (v === undefined || v === null) throw new Error(`:${key} is blank`);
            return v;
          };
        }
        const local = (target as any)._data.get(strProp);
        if (local !== undefined) return local;
        return self._parent?.get(strProp);
      },
    });
  }

  override get(key: string): unknown {
    const local = super.get(key);
    if (local !== undefined) return local;
    return this._parent?.get(key);
  }

  /** inheritable_copy — new InheritableOptions parented to self */
  inheritableCopy(): InheritableOptions {
    return new InheritableOptions(this);
  }

  override inspect(): string {
    const parentStr = this._parent ? `parent=${this._parent.inspect()}, ` : "";
    return `#<InheritableOptions {${parentStr}local=${JSON.stringify(this.toObject())}}>`;
  }
}
