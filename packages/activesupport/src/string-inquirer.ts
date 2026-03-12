/**
 * ActiveSupport::StringInquirer
 *
 * A string that makes equality checks more expressive via method-like access.
 * In Rails: env = ActiveSupport::StringInquirer.new("production")
 *           env.production? # => true
 *           env.development? # => false
 *
 * In TypeScript we use a Proxy to intercept property access.
 */

export class StringInquirer {
  private readonly _value: string;

  constructor(value: string) {
    this._value = value;
    return new Proxy(this, {
      get(target, prop: string | symbol) {
        if (typeof prop === "symbol" || prop in target) {
          return (target as any)[prop];
        }
        const name = prop.endsWith("?") ? prop.slice(0, -1) : prop;
        return () => target._value === name;
      },
    });
  }

  toString(): string {
    return this._value;
  }
  valueOf(): string {
    return this._value;
  }

  /** Programmatic inquiry — mirrors Ruby's respond_to? pattern. */
  is(name: string): boolean {
    return this._value === name;
  }
}

/**
 * Factory — mirrors Rails' String#inquiry core ext.
 */
export function inquiry(value: string): StringInquirer & Record<string, () => boolean> {
  return new StringInquirer(value) as any;
}
