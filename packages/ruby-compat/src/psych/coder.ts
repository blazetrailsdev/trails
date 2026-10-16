import { Mapping } from "./nodes/mapping.js";

/**
 * `Psych::Coder`'s `@tag` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:13`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const coderTag: unique symbol = Symbol("tag");

/**
 * `Psych::Coder`'s `@type` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:16`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const coderType: unique symbol = Symbol("type");

/**
 * `Psych::Coder`'s `@seq` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:14`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const coderSeq: unique symbol = Symbol("seq");

/**
 * `Psych::Coder`'s `@scalar` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:20`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const coderScalar: unique symbol = Symbol("scalar");

/**
 * `Psych::Coder`'s `@style` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:19`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const coderStyle: unique symbol = Symbol("style");

/**
 * `Psych::Coder`'s `@implicit` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:16`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const coderImplicit: unique symbol = Symbol("implicit");

/**
 * `Psych::Coder`'s `@object` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:21`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const coderObject: unique symbol = Symbol("object");

/**
 * `Psych::Coder` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:9`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Coder {
  /** @noRailsEquivalent PERMANENT */
  declare [coderTag]: string | null;
  /** @noRailsEquivalent PERMANENT */
  declare [coderType]: ":map" | ":seq" | ":scalar" | ":object";
  /** @noRailsEquivalent PERMANENT */
  declare [coderStyle]: number;
  /** @noRailsEquivalent PERMANENT */
  declare [coderImplicit]: boolean;
  /** @noRailsEquivalent PERMANENT */
  declare [coderObject]: unknown;
  /** @noRailsEquivalent PERMANENT */
  declare [coderScalar]: unknown;
  /** @noRailsEquivalent PERMANENT */
  declare [coderSeq]: unknown[];
  [key: string]: unknown;

  /** @noRailsEquivalent PERMANENT */
  constructor(tag: string | null) {
    Object.defineProperty(this, coderSeq, { value: [], writable: true });
    Object.defineProperty(this, coderImplicit, { value: false, writable: true });
    Object.defineProperty(this, coderType, { value: ":map", writable: true });
    Object.defineProperty(this, coderTag, { value: tag, writable: true });
    Object.defineProperty(this, coderStyle, { value: Mapping.BLOCK, writable: true });
    Object.defineProperty(this, coderScalar, { value: null, writable: true });
    Object.defineProperty(this, coderObject, { value: null, writable: true });
  }

  /**
   * `Psych::Coder#represent_scalar`
   * (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:42-45`).
   *
   * @noRailsEquivalent PERMANENT
   */
  representScalar(tag: string | null, value: unknown): void {
    this.setTag(tag);
    this.setScalar(value);
  }

  /**
   * `Psych::Coder#represent_seq`
   * (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:49-52`).
   *
   * @noRailsEquivalent PERMANENT
   */
  representSeq(tag: string | null, list: unknown[]): void {
    this[coderTag] = tag;
    this.setSeq(list);
  }

  /**
   * `Psych::Coder#represent_map`
   * (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:55-58`).
   *
   * @noRailsEquivalent PERMANENT
   */
  representMap(tag: string | null, map: Record<string, unknown>): void {
    this[coderTag] = tag;
    this.setMap(map);
  }

  /**
   * `Psych::Coder#represent_object`
   * (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:61-65`).
   *
   * @noRailsEquivalent PERMANENT
   */
  representObject(tag: string | null, obj: unknown): void {
    this[coderTag] = tag;
    this[coderType] = ":object";
    this[coderObject] = obj;
  }

  /**
   * `Psych::Coder#style=` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:10`, `attr_accessor :style`).
   *
   * @noRailsEquivalent PERMANENT
   */
  setStyle(style: number): void {
    this[coderStyle] = style;
  }

  /**
   * `Psych::Coder#implicit=` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:10`, `attr_accessor :implicit`).
   *
   * @noRailsEquivalent PERMANENT
   */
  setImplicit(implicit: boolean): void {
    this[coderImplicit] = implicit;
  }

  /**
   * `Psych::Coder#object=` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:10`, `attr_accessor :object`).
   *
   * @noRailsEquivalent PERMANENT
   */
  setObject(object: unknown): void {
    this[coderObject] = object;
  }

  /**
   * `Psych::Coder#scalar` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:24-31`).
   *
   * @noRailsEquivalent PERMANENT
   */
  scalar(...args: unknown[]): unknown {
    if (args.length > 0) {
      [this[coderTag], this[coderScalar]] = args as [string | null, unknown];
      this[coderType] = ":scalar";
    }
    return this[coderScalar];
  }

  /**
   * `Psych::Coder#scalar=` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:66-69`).
   *
   * @noRailsEquivalent PERMANENT
   */
  setScalar(value: unknown): void {
    this[coderType] = ":scalar";
    this[coderScalar] = value;
  }

  /**
   * `Psych::Coder#tag=` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:10`, `attr_accessor :tag`).
   *
   * @noRailsEquivalent PERMANENT
   */
  setTag(tag: string | null): void {
    this[coderTag] = tag;
  }

  /**
   * `Psych::Coder#map=` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:73-76`). The
   * map's pairs are the coder's own string-keyed properties, so `@map = map` replaces them.
   *
   * @noRailsEquivalent PERMANENT
   */
  setMap(map: Record<string, unknown>): void {
    this[coderType] = ":map";
    for (const k of Object.keys(this)) delete this[k];
    Object.assign(this, map);
  }

  /**
   * `Psych::Coder#seq=` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:91-94`).
   *
   * @noRailsEquivalent PERMANENT
   */
  setSeq(list: unknown[]): void {
    this[coderType] = ":seq";
    this[coderSeq] = list;
  }
}
