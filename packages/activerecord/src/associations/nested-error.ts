import { NestedError as ActiveModelNestedError } from "@blazetrails/activemodel";
import { ActiveRecord } from "../ar-config.js";

interface AssociationLike {
  owner: object | null;
  reflection: { name: string; options?: Record<string, unknown> };
  isCollection?(): boolean;
  target?: unknown[];
  nestedAttributesTarget?: unknown[];
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

export class NestedError extends ActiveModelNestedError {
  private readonly _association: AssociationLike;
  declare readonly innerError: InnerErrorLike;

  constructor(association: AssociationLike, innerError: InnerErrorLike) {
    const attribute = NestedError.computeAttribute(association, innerError);
    super(association.owner, innerError, { attribute });
    this._association = association;
  }

  /** @internal */
  get association(): AssociationLike {
    return this._association;
  }

  private static computeAttribute(
    association: AssociationLike,
    innerError: InnerErrorLike,
  ): string {
    const self: NestedError = Object.assign(Object.create(NestedError.prototype) as NestedError, {
      _association: association,
      innerError,
    });
    const name = association.reflection.name;
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

/** @internal */
function indexErrorsSetting(this: NestedError): boolean | "nestedAttributesOrder" {
  const opts = this.association.options ?? this.association.reflection.options;
  if (opts && "indexErrors" in opts) {
    return opts["indexErrors"] as boolean | "nestedAttributesOrder";
  }
  return ActiveRecord.indexNestedAttributeErrors;
}

/** @internal */
function index(this: NestedError): number | undefined {
  const records = orderedRecords.call(this);
  const base = this.innerError.base;
  if (!records || !base) return undefined;
  const idx = records.findIndex((r) => r === base);
  return idx >= 0 ? idx : undefined;
}

/** @internal */
function orderedRecords(this: NestedError): unknown[] | null {
  const setting = indexErrorsSetting.call(this);
  const assoc = this.association;
  if (setting === true) return Array.isArray(assoc.target) ? assoc.target : null;
  if (setting === "nestedAttributesOrder") return assoc.nestedAttributesTarget ?? null;
  return null;
}
