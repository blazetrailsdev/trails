import { NestedError as ActiveModelNestedError } from "@blazetrails/activemodel";
import { indexNestedAttributeErrors } from "../ar-config.js";

interface AssociationLike {
  owner: object | null;
  reflection: { name: string };
  isCollection?(): boolean;
  target?: unknown[];
  nestedAttributesTarget?: unknown[];
  // Rails index_errors: true = association order, :nested_attributes_order = write order
  options?: { indexErrors?: boolean | "nestedAttributesOrder" };
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
  /** @internal */
  readonly association: AssociationLike;

  constructor(association: AssociationLike, innerError: InnerErrorLike) {
    const attribute = NestedError.computeAttribute(association, innerError);
    super(association.owner, innerError, { attribute });
    this.association = association;
  }

  private static computeAttribute(
    association: AssociationLike,
    innerError: InnerErrorLike,
  ): string {
    const name = association.reflection.name;
    // isCollection: check the Association method if available, otherwise infer
    // from whether target is an array (CollectionProxy always has array target).
    const isCollection =
      typeof association.isCollection === "function"
        ? association.isCollection()
        : Array.isArray(association.target);
    // Falls back to global flag when not set per-association — mirrors Rails:
    //   association.options.fetch(:index_errors, ActiveRecord.index_nested_attribute_errors)
    // Options may be on association.options or association.reflection.options.
    const opts =
      (association.options as Record<string, unknown> | undefined) ??
      ((association.reflection as any)?.options as Record<string, unknown> | undefined);
    const indexErrors =
      opts && "indexErrors" in opts ? opts["indexErrors"] : indexNestedAttributeErrors;
    if (isCollection && indexErrors) {
      // :nested_attributes_order uses nestedAttributesTarget (write order),
      // true uses target (association/DB order) — mirrors Rails' ordered_records
      const records =
        indexErrors === "nestedAttributesOrder"
          ? association.nestedAttributesTarget
          : association.target;
      const index = records?.findIndex((r) => r === innerError.base);
      if (index != null && index >= 0) {
        return `${name}[${index}].${innerError.attribute}`;
      }
    }
    return `${name}.${innerError.attribute}`;
  }
}

/** @internal */
function association(err: NestedError): NestedError["association"] {
  return err.association;
}

/** @internal */
function indexErrorsSetting(err: NestedError): boolean | "nestedAttributesOrder" {
  const opts =
    ((err.association as any).options as Record<string, unknown> | undefined) ??
    ((err.association as any).reflection?.options as Record<string, unknown> | undefined);
  if (opts && "indexErrors" in opts) {
    return opts["indexErrors"] as boolean | "nestedAttributesOrder";
  }
  return indexNestedAttributeErrors;
}

/** @internal */
function index(err: NestedError, innerError: { base?: unknown }): number | undefined {
  const records = orderedRecords(err);
  if (!records || !innerError.base) return undefined;
  const idx = records.findIndex((r) => r === innerError.base);
  return idx >= 0 ? idx : undefined;
}

/** @internal */
function orderedRecords(err: NestedError): unknown[] | null {
  const setting = indexErrorsSetting(err);
  const assoc = err.association;
  if (setting === true) return Array.isArray(assoc.target) ? assoc.target : null;
  if (setting === "nestedAttributesOrder") return (assoc as any).nestedAttributesTarget ?? null;
  return null;
}

// Silence "unused" — these are Rails-private helpers that mirror nested_error.rb's
// `attr_reader :association`, `index_errors_setting`, `index`, `ordered_records`.
// Counted by api:compare; intentionally not exported (Rails marks them private).
void association;
void index;
