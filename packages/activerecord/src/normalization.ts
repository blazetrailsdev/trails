import { methodMissingProxy } from "@blazetrails/activesupport";
import { SerializeCastValue } from "@blazetrails/activemodel";
import type { Type } from "@blazetrails/activemodel";

/** Args accepted by `normalizes` — attributes, transform fn, and optional options. */
export type NormalizesArgs =
  | [...string[], (value: unknown) => unknown]
  | [...string[], (value: unknown) => unknown, { applyToNil?: boolean }];

/**
 * One attribute's accumulated normalizers. Rails keeps only the attribute
 * NAMES (`class_attribute :normalized_attributes`) because the normalizer
 * itself lives in the decorated cast type; trails also keeps the functions so a
 * decorator can be rebuilt when the attribute set is re-reflected from the
 * schema.
 *
 * @internal
 */
interface NormalizationEntry {
  fns: Array<(value: unknown) => unknown>;
  applyToNil: boolean;
}

/**
 * The class-side surface `Normalization` needs from its host.
 *
 * @internal
 */
interface NormalizationClass {
  _normalizations: Map<string, NormalizationEntry>;
  _normalizeChangedInPlaceRegistered?: boolean;
  decorateAttributes(names: string[], decorator: (name: string, castType: Type) => Type): void;
  beforeValidation(callback: (record: any) => void): void;
  typeForAttribute(name: string): Type;
}

/**
 * The instance-side surface `Normalization` needs from its host.
 *
 * @internal
 */
interface NormalizationRecord {
  attributeChangedInPlace(name: string): boolean;
  readAttribute(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
}

/**
 * Normalizes a specified attribute using its declared normalizations.
 *
 * Mirrors: ActiveRecord::Normalization#normalize_attribute (normalization.rb:26)
 */
export function normalizeAttribute(this: NormalizationRecord, name: string): void {
  // Treat the value as a new, unnormalized value.
  // Rails: `self[name] = self[name]`.
  this.writeAttribute(name, this.readAttribute(name));
}

export const ClassMethods = {
  /**
   * Declares a normalization for one or more attributes. The normalization is
   * applied when the attribute is assigned or updated, and the normalized value
   * will be persisted to the database. The normalization is also applied to the
   * corresponding keyword argument of query methods.
   *
   * Mirrors: ActiveRecord::Normalization::ClassMethods#normalizes (normalization.rb:88)
   *
   * @missingRailsArgs new — PERMANENT: `NormalizedValueType.new` gets every
   *   Rails kwarg with the same key and value, but Rails' normalizer local is
   *   named `with` (the kwarg it arrived in) and `with` is a reserved word in
   *   JavaScript, so it cannot be an identifier here.
   */
  normalizes(this: NormalizationClass, ...args: NormalizesArgs): void {
    if (!Object.hasOwn(this, "_normalizations")) {
      const inherited = this._normalizations;
      this._normalizations = new Map();
      if (inherited) {
        for (const [k, v] of inherited) {
          this._normalizations.set(k, { fns: [...v.fns], applyToNil: v.applyToNil });
        }
      }
    }

    let options: { applyToNil?: boolean } = {};
    let fn: (value: unknown) => unknown;
    const lastArg = args[args.length - 1];
    let names: string[];
    if (typeof lastArg === "object" && lastArg !== null && !Array.isArray(lastArg)) {
      options = lastArg as { applyToNil?: boolean };
      fn = args[args.length - 2] as (value: unknown) => unknown;
      names = args.slice(0, -2) as string[];
    } else {
      fn = lastArg as (value: unknown) => unknown;
      names = args.slice(0, -1) as string[];
    }
    const applyToNil = !!options.applyToNil;

    // trails' analogue of `self.normalized_attributes += names.map(&:to_sym)`
    // (normalization.rb:94), hoisted above `decorate_attributes` because — unlike
    // Rails, whose block closes over `with`/`apply_to_nil` directly — the block
    // below reads the accumulated entry so a pending-decorator replay after a
    // schema re-reflection rebuilds the SAME normalizer.
    for (const name of names) {
      const existing = this._normalizations.get(name);
      if (existing) {
        existing.fns.push(fn);
        if (applyToNil) existing.applyToNil = true;
      } else {
        this._normalizations.set(name, { fns: [fn], applyToNil });
      }
    }

    this.decorateAttributes(names, (name: string, castType: Type): Type => {
      const entry = this._normalizations.get(name);
      if (!entry) return castType;
      // The entry is the decorator's identity token: skip when this cast type is
      // already wrapped with the SAME entry (the immediate apply and the durable
      // pending replay both run this block), and unwrap+rewrap when a
      // different/older one is found, so subclass stacking replaces the parent's
      // wrap with the fuller combined set and a non-idempotent normalizer is
      // never applied twice.
      if (castType instanceof NormalizedValueType && castType.token === entry) {
        return null as unknown as Type;
      }
      while (castType instanceof NormalizedValueType) castType = castType.castType;
      const fns = entry.fns;
      const normalizer = (value: unknown): unknown => {
        let result = value;
        for (const fn of fns) result = fn(result);
        return result;
      };
      const type = new NormalizedValueType({
        castType,
        normalizer,
        normalizeNil: entry.applyToNil,
      });
      type.token = entry;
      return type as unknown as Type;
    });

    // Rails registers `before_validation :normalize_changed_in_place_attributes`
    // in the Concern's `included` block (normalization.rb:10). trails registers
    // it lazily on the first class in a hierarchy to call `normalizes`
    // (subclasses inherit the callback via the copy-on-write chain, so the
    // inherited-truthy guard keeps exactly one registration).
    if (!this._normalizeChangedInPlaceRegistered) {
      Object.defineProperty(this, "_normalizeChangedInPlaceRegistered", {
        value: true,
        writable: true,
        configurable: true,
      });
      this.beforeValidation(
        (record: NormalizationRecord & { normalizeChangedInPlaceAttributes(): void }) => {
          record.normalizeChangedInPlaceAttributes();
        },
      );
    }
  },

  /**
   * Normalizes a given +value+ using normalizations declared for +name+.
   *
   * Mirrors: ActiveRecord::Normalization::ClassMethods#normalize_value_for
   * (normalization.rb:106)
   */
  normalizeValueFor(this: NormalizationClass, name: string, value: unknown): unknown {
    return this.typeForAttribute(name).cast(value);
  },
};

/**
 * Re-normalize every normalized attribute that has changed in place, so a
 * mutated value is normalized before validation and persistence.
 *
 * Mirrors: ActiveRecord::Normalization#normalize_changed_in_place_attributes
 * (normalization.rb:112, private)
 *
 * @internal
 */
export function normalizeChangedInPlaceAttributes(
  this: NormalizationRecord & { normalizeAttribute(name: string): void },
): void {
  for (const name of (this.constructor as unknown as { normalizedAttributes: Set<string> })
    .normalizedAttributes) {
    if (this.attributeChangedInPlace(name)) this.normalizeAttribute(name);
  }
}

/**
 * Set of attribute names with a registered normalizer.
 *
 * Mirrors: ActiveRecord::Normalization's `class_attribute :normalized_attributes`
 * (normalization.rb:8). trails stores the normalizer functions alongside the
 * names in `_normalizations`; this reader is the Rails-shaped Set view.
 */
export function normalizedAttributes(klass: {
  _normalizations?: Map<string, unknown>;
}): Set<string> {
  return new Set(klass._normalizations ? klass._normalizations.keys() : []);
}

/**
 * Decorates an underlying cast type with a normalizer. When `cast` is called,
 * the value is first cast by the underlying type, then the normalizer is
 * applied — this is the single point where normalization happens.
 *
 * `serialize` normalizes (casts then serializes) — matching Rails'
 * `serialize(value) = serialize_cast_value(cast(value))` — because a query bind
 * built from a raw value (`StatementCache` substitution binds an un-cast value
 * via `withCastValue`) reaches the database through `serialize`.
 * `serializeCastValue` does NOT re-normalize (its input is already a cast
 * value): the instance write path serializes `this.value` (already
 * cast+normalized) through the cast-value fast path, so persistence never
 * double-applies a non-idempotent normalizer (the "minimizes number of times
 * normalization is applied" contract). Every other method (deserialize,
 * isChanged, type metadata, …) delegates to the underlying type unchanged —
 * notably `deserialize` does NOT normalize, so values read from the database are
 * left as-is (Rails: normalization is applied on assignment and query, not on
 * load).
 *
 * Mirrors: ActiveRecord::Normalization::NormalizedValueType (normalization.rb:117),
 * a `DelegateClass(ActiveModel::Type::Value)` overriding `cast`, `serialize`, and
 * `serialize_cast_value`. We model the DelegateClass with `methodMissingProxy`
 * over the instance, whose delegate is the wrapped type — so every method this
 * class does not define binds to the wrapped type, and `deserialize` (which
 * internally calls `cast`) uses that type's un-normalized cast rather than this
 * decorator's normalizing one.
 */
export class NormalizedValueType {
  readonly castType: Type;
  readonly normalizer: (value: unknown) => unknown;
  readonly normalizeNil: boolean;

  /**
   * Identity used by the attribute-decoration pipeline to recognize "already
   * decorated by this normalization" during seed + pending replay, so a
   * normalizer applies exactly once per attribute.
   *
   * @internal
   */
  token: unknown = undefined;

  constructor(options: {
    castType: Type;
    normalizer: (value: unknown) => unknown;
    normalizeNil: boolean;
  }) {
    this.castType = options.castType;
    this.normalizer = options.normalizer;
    this.normalizeNil = options.normalizeNil;
    // Ruby's `super(cast_type)` — DelegateClass forwarding for every method
    // this class does not define.
    return methodMissingProxy(this, {
      delegate: (target) => target.castType,
    });
  }

  cast(value: unknown): unknown {
    return normalize(this, this.castType.cast(value));
  }

  serialize(value: unknown): unknown {
    // Rails: serialize_cast_value(cast(value)). Normalizes a raw value fed
    // straight to serialize (e.g. a StatementCache query bind).
    return this.serializeCastValue(this.cast(value));
  }

  /**
   * Mirrors Rails' `ActiveModel::Type::SerializeCastValue.serialize(cast_type, value)`:
   * route an already-cast value through the underlying type's cast-value fast
   * path when compatible, else its full `serialize`. Never re-normalizes.
   */
  serializeCastValue(value: unknown): unknown {
    return SerializeCastValue.serialize(
      this.castType as unknown as Parameters<typeof SerializeCastValue.serialize>[0],
      value,
    );
  }

  /**
   * Rails' NormalizedValueType `include`s SerializeCastValue and defines
   * `serialize`/`serialize_cast_value` at the same level, so it is ALWAYS
   * serialize-cast-value-compatible (independent of the wrapped type). Return
   * the decorator itself so the persisted-value path dispatches through this
   * type's non-normalizing `serializeCastValue` rather than the normalizing
   * `serialize` — otherwise a non-idempotent normalizer double-applies on save.
   */
  itselfIfSerializeCastValueCompatible(): Type {
    return this as unknown as Type;
  }
}

/**
 * Mirrors: ActiveRecord::Normalization::NormalizedValueType#normalize
 * (normalization.rb:154, private) — `normalizer.call(value) unless value.nil? && !normalize_nil?`.
 *
 * @internal
 */
function normalize(type: NormalizedValueType, value: unknown): unknown {
  if ((value === null || value === undefined) && !type.normalizeNil) return value;
  return type.normalizer(value);
}
