import { NestedError as ActiveModelNestedError } from "@blazetrails/activemodel";
import { indexNestedAttributeErrors } from "../ar-config.js";

interface AssociationLike {
  owner: object | null;
  reflection: { name: string; options?: Record<string, unknown> };
  isCollection?(): boolean;
  target?: unknown[];
  nestedAttributesTarget?: unknown[];
  // Rails index_errors: true = association order, :nested_attributes_order = write order
  options?: Record<string, unknown>;
}

interface InnerErrorLike {
  attribute: string;
  type: string;
  rawType?: string;
  message: string;
  options?: Record<string, unknown>;
  base?: unknown;
}

/**
 * Wraps validation errors from nested associations, rewriting the
 * attribute so it reads as `association.attr` (or `association[i].attr`
 * when `index_errors` is enabled on a collection association).
 *
 * Mirrors: ActiveRecord::Associations::NestedError
 */
export class NestedError extends ActiveModelNestedError {
  private readonly _association: AssociationLike;
  // Narrows the base class' `innerError` to the AR shape — `index` reads
  // `inner_error.base` (nested_error.rb:34).
  declare readonly innerError: InnerErrorLike;

  constructor(association: AssociationLike, innerError: InnerErrorLike) {
    const attribute = NestedError.computeAttribute(association, innerError);
    super(association.owner, innerError, { attribute });
    this._association = association;
  }

  /** Mirrors Rails' `attr_reader :association` (nested_error.rb:16). @internal */
  get association(): AssociationLike {
    return this._association;
  }

  private static computeAttribute(
    association: AssociationLike,
    innerError: InnerErrorLike,
  ): string {
    // Ruby runs `compute_attribute` as an instance method inside the
    // constructor — after `@association` and `@inner_error` are set but *before*
    // `super` (nested_error.rb:8-12). TS forbids touching `this` before
    // `super`, so the readers below run against a receiver carrying exactly the
    // two ivars Ruby has at that point.
    const self: NestedError = Object.assign(Object.create(NestedError.prototype) as NestedError, {
      _association: association,
      innerError,
    });
    const name = association.reflection.name;
    // isCollection: check the Association method if available, otherwise infer
    // from whether target is an array (CollectionProxy always has array target).
    const isCollection =
      typeof association.isCollection === "function"
        ? association.isCollection()
        : Array.isArray(association.target);
    if (isCollection && indexErrorsSetting.call(self)) {
      const idx = index.call(self);
      if (idx != null) {
        return `${name}[${idx}].${innerError.attribute}`;
      }
    }
    return `${name}.${innerError.attribute}`;
  }
}

// Rails marks the readers below `private`, so they stay module-local functions
// rather than prototype methods; `this`-typing keeps their signature identical
// to Ruby's zero-arg instance methods.

/**
 * Mirrors Rails' `index_errors_setting` (nested_error.rb:29-32):
 * `association.options.fetch(:index_errors, ActiveRecord.index_nested_attribute_errors)`.
 * Options may sit on `association.options` or `association.reflection.options`.
 * @internal
 */
function indexErrorsSetting(this: NestedError): boolean | "nestedAttributesOrder" {
  const opts = this.association.options ?? this.association.reflection.options;
  if (opts && "indexErrors" in opts) {
    return opts["indexErrors"] as boolean | "nestedAttributesOrder";
  }
  return indexNestedAttributeErrors;
}

/**
 * Mirrors Rails' `index` (nested_error.rb:33-35) —
 * `ordered_records&.find_index(inner_error.base)`, reading `inner_error` off
 * the instance.
 * @internal
 */
function index(this: NestedError): number | undefined {
  const records = orderedRecords.call(this);
  const base = this.innerError.base;
  if (!records || !base) return undefined;
  const idx = records.findIndex((r) => r === base);
  return idx >= 0 ? idx : undefined;
}

/**
 * Mirrors Rails' `ordered_records` (nested_error.rb:37-44): `true` means
 * association order (`target`), `:nested_attributes_order` means write order
 * (`nested_attributes_target`), anything else means no indexing at all.
 * @internal
 */
function orderedRecords(this: NestedError): unknown[] | null {
  const setting = indexErrorsSetting.call(this);
  const assoc = this.association;
  if (setting === true) return Array.isArray(assoc.target) ? assoc.target : null;
  if (setting === "nestedAttributesOrder") return assoc.nestedAttributesTarget ?? null;
  return null;
}
