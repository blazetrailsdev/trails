import { Attribute } from "../attribute.js";
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
    const attrs = new Map<string, Attribute>();

    for (const [name, type] of this.types) {
      const effectiveType = additionalTypes.get(name) ?? type;
      if (Object.prototype.hasOwnProperty.call(values, name)) {
        attrs.set(name, Attribute.fromDatabase(name, values[name], effectiveType));
      } else {
        const defaultAttr = this.defaultAttributes.get(name);
        if (defaultAttr) {
          attrs.set(name, dupAttribute(defaultAttr));
        } else {
          attrs.set(name, Attribute.uninitialized(name, effectiveType));
        }
      }
    }

    return new AttributeSet(attrs);
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

/**
 * Lazy variant of AttributeSet that carries an extra `additionalTypes` map and
 * supports on-demand materialization of those entries into the internal store.
 *
 * Mirrors: ActiveModel::LazyAttributeSet
 */
export class LazyAttributeSet extends AttributeSet {
  private _additionalTypes: Map<string, Type>;

  constructor(
    attributes: Map<string, Attribute> = new Map(),
    additionalTypes: Map<string, Type> = new Map(),
  ) {
    super(attributes);
    this._additionalTypes = additionalTypes;
  }

  /** @internal Rails-private helper. Mirrors: LazyAttributeSet#additional_types (attr_reader) */
  additionalTypes(): Map<string, Type> {
    return this._additionalTypes;
  }

  override deepDup(): LazyAttributeSet {
    const cache = new Map<Attribute, Attribute>();
    const newAttrs = new Map<string, Attribute>();
    this.forEach((attr, name) => newAttrs.set(name, this.cloneAttribute(attr, cache)));
    return new LazyAttributeSet(newAttrs, new Map(this._additionalTypes));
  }

  /**
   * @internal Rails-private helper. Mirrors: LazyAttributeSet#materialize (protected)
   * Materializes the lazy set by resolving all keys into the attribute map.
   */
  protected materialize(): Map<string, Attribute> {
    // Write additionalTypes-only keys into the internal store so that
    // subsequent getAttribute/has/forEach calls can see them — mirrors
    // Rails' @additional_types.each_key { |name| self[name] } side-effect.
    for (const [name, type] of this._additionalTypes) {
      if (!this.hasAttribute(name)) this.set(name, Attribute.uninitialized(name, type));
    }
    const result = new Map<string, Attribute>();
    this.forEach((attr, name) => result.set(name, attr));
    return result;
  }

  override map(fn: (attr: Attribute) => Attribute): LazyAttributeSet {
    const newAttrs = new Map<string, Attribute>();
    this.forEach((attr, name) => newAttrs.set(name, fn(attr)));
    return new LazyAttributeSet(newAttrs, new Map(this._additionalTypes));
  }
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

  keys(): string[] {
    const allKeys = new Set([
      ...this.delegate.keys(),
      ...Object.keys(this.values),
      ...this.types.keys(),
    ]);
    return [...allKeys];
  }

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

  eachKey(fn: (key: string) => void): void {
    const allKeys = new Set([
      ...this.delegate.keys(),
      ...Object.keys(this.values),
      ...this.types.keys(),
    ]);
    for (const key of allKeys) fn(key);
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

  get(name: string): Attribute {
    if (this.delegate.has(name)) return this.delegate.get(name)!;
    return this.assignDefault(name);
  }

  set(name: string, attr: Attribute): void {
    this.delegate.set(name, attr);
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
