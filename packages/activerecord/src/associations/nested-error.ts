import { NestedError as ActiveModelNestedError } from "@blazetrails/activemodel";

interface AssociationLike {
  owner: unknown;
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
    const isCollection = association.isCollection?.() ?? false;
    const indexErrors = association.options?.indexErrors;
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

function association(err: NestedError): NestedError["association"] {
  return err.association;
}

function indexErrorsSetting(err: NestedError): boolean | "nestedAttributesOrder" {
  return (err.association as any).options?.indexErrors ?? false;
}

function index(err: NestedError, innerError: { base?: unknown }): number | undefined {
  const records = orderedRecords(err);
  if (!records || !innerError.base) return undefined;
  const idx = records.findIndex((r) => r === innerError.base);
  return idx >= 0 ? idx : undefined;
}

function orderedRecords(err: NestedError): unknown[] | null {
  const setting = indexErrorsSetting(err);
  const assoc = err.association;
  if (setting === true) return Array.isArray(assoc.target) ? assoc.target : null;
  if (setting === "nestedAttributesOrder") return (assoc as any).nestedAttributesTarget ?? null;
  return null;
}
