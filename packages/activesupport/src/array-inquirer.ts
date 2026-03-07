/**
 * ActiveSupport::ArrayInquirer
 *
 * An array that makes membership checks more expressive via method-like access.
 * In Rails: kinds = ActiveSupport::ArrayInquirer.new([:phone, :tablet])
 *           kinds.phone?  # => true
 *           kinds.laptop? # => false
 *           kinds.any?(:phone, :tablet) # => true
 */

export class ArrayInquirer<T extends string | symbol> extends Array<T> {
  private _proxy!: this;

  constructor(...items: T[]) {
    super(...items);
    const proxy = new Proxy(this, {
      get(target, prop: string | symbol) {
        if (prop in target || typeof prop === "symbol") {
          const val = (target as any)[prop];
          if (typeof val === "function") {
            return function(this: unknown, ...args: unknown[]) {
              return val.apply(target, args);
            };
          }
          return val;
        }
        if (typeof prop === "string") {
          const name = (prop.endsWith("?") ? prop.slice(0, -1) : prop) as unknown as T;
          return () => (target as unknown as T[]).includes(name);
        }
        return undefined;
      },
    });
    this._proxy = proxy;
    return proxy;
  }

  /** any?(*values) — true if any of the given values are in the array. */
  any(...values: (string | symbol | ((item: T) => boolean))[]): boolean {
    if (values.length === 0) return this.length > 0;
    return values.some((v) => {
      if (typeof v === "function") return (this as unknown as T[]).some(v as (item: T) => boolean);
      return (this as unknown as T[]).includes(v as T);
    });
  }

  /** inquiry — alias that returns self (matches Rails API) */
  inquiry(): this { return this._proxy; }
}

/**
 * Factory — mirrors Rails' Array#inquiry core ext.
 */
export function arrayInquiry<T extends string | symbol>(items: T[]): ArrayInquirer<T> & Record<string, () => boolean> {
  return new ArrayInquirer<T>(...items) as any;
}
