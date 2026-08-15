import { Attribute, Uninitialized } from "../attribute.js";
import { Type } from "../type/value.js";
import { AttributeSet } from "../attribute-set.js";

export class Builder {
  readonly types: Map<string, Type>;
  readonly defaultAttributes: Map<string, Attribute>;

  constructor(types: Map<string, Type>, defaultAttributes: Map<string, Attribute> = new Map()) {
    this.types = types;
    this.defaultAttributes = defaultAttributes;
  }

  buildFromDatabase(
    values: Record<string, unknown> = {},
    additionalTypes: Map<string, Type> = new Map(),
  ): AttributeSet {
    return new LazyAttributeSet(values, this.types, additionalTypes, this.defaultAttributes);
  }
}

/**
 * Shallow clone of an Attribute that preserves the prototype chain, so
 * mutations on the clone don't bleed back into the schema-default prototype.
 *
 * Mirrors: `default.dup` in ActiveModel::LazyAttributeHash#assign_default_value
 *
 * @internal Rails-private helper.
 */
function dupAttribute(attr: Attribute): Attribute {
  return Object.assign(Object.create(Object.getPrototypeOf(attr)), attr);
}

/** Mirrors: ActiveModel::LazyAttributeSet */
export class LazyAttributeSet extends AttributeSet {
  private values: Record<string, unknown>;
  private types: Map<string, Type>;
  private additionalTypes: Map<string, Type>;
  private defaultAttributes: Map<string, Attribute>;
  private castedValues: Map<string, unknown>;
  private materialized: boolean;

  constructor(
    values: Record<string, unknown>,
    types: Map<string, Type>,
    additionalTypes: Map<string, Type>,
    defaultAttributes: Map<string, Attribute>,
    attributes: Map<string, Attribute> = new Map(),
  ) {
    super(attributes);
    this.values = values;
    this.types = types;
    this.additionalTypes = additionalTypes;
    this.defaultAttributes = defaultAttributes;
    this.castedValues = new Map();
    this.materialized = false;
  }

  override isKey(name: string): boolean {
    return (
      (Object.prototype.hasOwnProperty.call(this.values, name) ||
        this.types.has(name) ||
        this._attributes.has(name)) &&
      this.getAttribute(name).isInitialized()
    );
  }

  override keys(): string[] {
    const keys = new Set([
      ...Object.keys(this.values),
      ...this.types.keys(),
      ...this._attributes.keys(),
    ]);
    return [...keys].filter((name) => this.getAttribute(name).isInitialized());
  }

  override fetchValue(name: string, block?: (name: string) => unknown): unknown {
    const attr = this._attributes.get(name);
    if (attr) {
      return blockOrValue(attr, block);
    }

    if (this.castedValues.has(name)) return this.castedValues.get(name);

    let valuePresent = true;
    let value: unknown;
    if (Object.prototype.hasOwnProperty.call(this.values, name)) {
      value = this.values[name];
    } else {
      valuePresent = false;
    }

    if (valuePresent) {
      const type = this.additionalTypes.get(name) ?? this.types.get(name)!;
      const casted = type.deserialize(value);
      this.castedValues.set(name, casted);
      return casted;
    } else {
      return blockOrValue(this.defaultAttribute(name, valuePresent, value), block);
    }
  }

  protected override attributes(): Map<string, Attribute> {
    if (!this.materialized) {
      for (const key of Object.keys(this.values)) this.getAttribute(key);
      for (const key of this.types.keys()) this.getAttribute(key);
      this.materialized = true;
    }
    return this._attributes;
  }

  protected override defaultAttribute(
    name: string,
    valuePresent?: boolean,
    value?: unknown,
  ): Attribute {
    // Rails defaults `value` to `values.fetch(name) { value_present = false }`,
    // evaluated only when the caller omits it (builder.rb:69-73).
    if (valuePresent === undefined) {
      valuePresent = Object.prototype.hasOwnProperty.call(this.values, name);
      value = valuePresent ? this.values[name] : undefined;
    }

    const type = this.additionalTypes.get(name) ?? this.types.get(name);

    if (valuePresent) {
      // `Attribute#initialize` keeps the computed-value slot empty when the
      // 4th argument is nil (attribute.rb:37), so only thread a cached cast
      // through when one exists.
      const castedValue = this.castedValues.get(name);
      const attr =
        castedValue === undefined
          ? Attribute.fromDatabase(name, value, type!)
          : Attribute.fromDatabase(name, value, type!, castedValue);
      this._attributes.set(name, attr);
      return attr;
    } else if (this.types.has(name)) {
      const attr = this.defaultAttributes.get(name);
      const built = attr ? dupAttribute(attr) : Attribute.uninitialized(name, type!);
      this._attributes.set(name, built);
      return built;
    } else {
      return Attribute.null(name);
    }
  }
}

/**
 * Ruby's `attr.value(&block)`: an Uninitialized attribute yields its name to
 * the block, every other attribute ignores it (attribute.rb `Uninitialized#value`).
 *
 * @noRailsEquivalent Ruby passes the block through `value(&block)`; trails'
 *   `Attribute#value` is a getter, so the block arm lives at the call site.
 */
function blockOrValue(attr: Attribute, block?: (name: string) => unknown): unknown {
  if (block !== undefined && attr instanceof Uninitialized) return block(attr.name);
  return attr.value;
}

/**
 * Lazy hash of attribute objects, materializes on demand.
 *
 * Mirrors: ActiveModel::LazyAttributeHash
 */
export class LazyAttributeHash {
  private delegate: Map<string, Attribute>;
  private types: Map<string, Type>;
  private values: Record<string, unknown>;
  private additionalTypes: Map<string, Type>;
  private defaultAttributes: Map<string, Attribute>;

  /**
   * Return a new map applying `fn` to each materialized Attribute.
   *
   * Mirrors: `delegate :transform_values, to: :materialize` — Hash#transform_values
   * (generic over the block result, e.g. `attributes.transform_values(&:type)`).
   */
  transformValues<T>(fn: (attr: Attribute) => T): Map<string, T> {
    const result = new Map<string, T>();
    for (const [name, attr] of this.materialize()) result.set(name, fn(attr));
    return result;
  }

  /**
   * Yield each materialized Attribute value.
   *
   * Mirrors: `delegate :each_value, to: :materialize` — Hash#each_value.
   */
  eachValue(fn: (attr: Attribute) => void): void {
    for (const attr of this.materialize().values()) fn(attr);
  }

  /**
   * Fetch the materialized Attribute under `name`. Mirrors Ruby `Hash#fetch`:
   * with a block (function) the block result is the fallback; with a plain
   * default value that value is returned; with neither, an absent key throws
   * KeyError.
   *
   * Mirrors: `delegate :fetch, to: :materialize`.
   */
  fetch(name: string, defaultOrBlock?: Attribute | ((name: string) => Attribute)): Attribute {
    const materialized = this.materialize();
    const attr = materialized.get(name);
    if (attr !== undefined) return attr;
    if (typeof defaultOrBlock === "function") return defaultOrBlock(name);
    if (defaultOrBlock !== undefined) return defaultOrBlock;
    const err = new Error(`key not found: ${JSON.stringify(name)}`);
    err.name = "KeyError";
    throw err;
  }

  /**
   * Return a copy of the materialized hash with `names` removed.
   *
   * Mirrors: `delegate :except, to: :materialize` — Hash#except.
   */
  except(...names: string[]): Map<string, Attribute> {
    const drop = new Set(names);
    const result = new Map<string, Attribute>();
    for (const [name, attr] of this.materialize()) {
      if (!drop.has(name)) result.set(name, attr);
    }
    return result;
  }

  constructor(
    types: Map<string, Type>,
    values: Record<string, unknown>,
    additionalTypes: Map<string, Type> = new Map(),
    defaultAttributes: Map<string, Attribute> = new Map(),
    delegateHash: Map<string, Attribute> = new Map(),
  ) {
    this.types = types;
    this.values = values;
    this.additionalTypes = additionalTypes;
    this.defaultAttributes = defaultAttributes;
    this.delegate = delegateHash;
  }

  isKey(key: string): boolean {
    return this.has(key);
  }

  get(name: string): Attribute {
    if (this.delegate.has(name)) return this.delegate.get(name)!;
    return this.assignDefault(name);
  }

  set(name: string, attr: Attribute): void {
    this.delegate.set(name, attr);
  }

  deepDup(): LazyAttributeHash {
    const copy = new LazyAttributeHash(
      this.types,
      { ...this.values },
      this.additionalTypes,
      this.defaultAttributes,
    );
    const cache = new Map<Attribute, Attribute>();
    for (const [name, attr] of this.delegate) {
      copy.delegate.set(name, LazyAttributeHash.cloneAttr(attr, cache));
    }
    return copy;
  }

  /**
   * Mirrors: LazyAttributeHash#each_key (builder.rb:129-132) — unions
   * `types | values | delegate_hash` and yields every key. Unlike `keys`, it
   * does not drop uninitialized attributes.
   */
  eachKey(fn: (key: string) => void): void {
    const keys = new Set([
      ...this.types.keys(),
      ...Object.keys(this.values),
      ...this.delegate.keys(),
    ]);
    for (const key of keys) fn(key);
  }

  marshalDump(): [
    Map<string, Type>,
    Record<string, unknown>,
    Map<string, Type>,
    Map<string, Attribute>,
    Map<string, Attribute>,
  ] {
    return [this.types, this.values, this.additionalTypes, this.defaultAttributes, this.delegate];
  }

  static marshalLoad(
    data: [
      Map<string, Type>,
      Record<string, unknown>,
      (Map<string, Type> | undefined)?,
      (Map<string, Attribute> | undefined)?,
      (Map<string, Attribute> | undefined)?,
    ],
  ): LazyAttributeHash {
    return new LazyAttributeHash(data[0], data[1], data[2], data[3], data[4]);
  }

  /**
   * Force every value/type key into the delegate hash and return it.
   *
   * Mirrors: LazyAttributeHash#materialize (protected) — `values.each_key`
   * and `types.each_key` resolve through `self[key]`, then `delegate_hash`
   * is returned.
   *
   * @internal Rails-private helper.
   */
  protected materialize(): Map<string, Attribute> {
    for (const key of Object.keys(this.values)) this.get(key);
    for (const key of this.types.keys()) this.get(key);
    return this.delegate;
  }

  /** @internal Rails-private helper. Mirrors: LazyAttributeHash#delegate_hash (attr_reader) */
  delegateHash(): Map<string, Attribute> {
    return this.delegate;
  }

  /**
   * @internal Rails-private helper. Mirrors: LazyAttributeHash#assign_default_value
   * Materializes an attribute entry for `name` from the value/type tables.
   */
  assignDefaultValue(name: string): Attribute {
    return this.assignDefault(name);
  }

  keys(): string[] {
    const keys = new Set([
      ...Object.keys(this.values),
      ...this.types.keys(),
      ...this.delegate.keys(),
    ]);
    return [...keys].filter((name) => this.get(name).isInitialized());
  }

  has(name: string): boolean {
    return (
      this.delegate.has(name) ||
      Object.prototype.hasOwnProperty.call(this.values, name) ||
      this.types.has(name)
    );
  }

  private static cloneAttr(attr: Attribute, cache: Map<Attribute, Attribute>): Attribute {
    const existing = cache.get(attr);
    if (existing) return existing;
    const cloned = Object.assign(Object.create(Object.getPrototypeOf(attr)), attr);
    cache.set(attr, cloned);
    const orig = attr.getOriginalAttribute();
    if (orig) {
      cloned.setOriginalAttribute(LazyAttributeHash.cloneAttr(orig, cache));
    }
    return cloned;
  }

  private assignDefault(name: string): Attribute {
    const type = this.additionalTypes.get(name) ?? this.types.get(name);
    if (Object.prototype.hasOwnProperty.call(this.values, name) && type) {
      const attr = Attribute.fromDatabase(name, this.values[name], type);
      this.delegate.set(name, attr);
      return attr;
    }
    if (this.types.has(name)) {
      const defaultAttr = this.defaultAttributes.get(name);
      const attr = defaultAttr ? dupAttribute(defaultAttr) : Attribute.uninitialized(name, type!);
      this.delegate.set(name, attr);
      return attr;
    }
    return Attribute.null(name);
  }
}
