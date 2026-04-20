import { NestedError as ActiveModelNestedError } from "@blazetrails/activemodel";

interface AssociationLike {
  owner: unknown;
  reflection: { name: string };
  isCollection?(): boolean;
  target?: unknown[];
  options?: { indexErrors?: boolean };
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
    if (isCollection && association.options?.indexErrors) {
      const index = association.target?.findIndex((r) => r === innerError.base);
      if (index != null && index >= 0) {
        return `${name}[${index}].${innerError.attribute}`;
      }
    }
    return `${name}.${innerError.attribute}`;
  }
}
