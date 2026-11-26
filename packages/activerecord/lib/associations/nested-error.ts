import { underscore } from "@blazetrails/activesupport";
import { NestedError as ActiveModelNestedError } from "@blazetrails/activemodel";
import { rtest, toS } from "@blazetrails/ruby-compat/object";
import { stringToSym } from "@blazetrails/ruby-compat/symbol";
import { indexNestedAttributeErrors } from "../active-record.js";

interface AssociationLike {
  owner: object | null;
  reflection: { name: string; options?: Record<string, unknown> };
  isCollection(): boolean;
  target?: unknown[];
  nestedAttributesTarget?: unknown[];
  options?: Record<string, unknown>;
}

interface InnerErrorLike {
  attribute: string;
  type: string;
  rawType?: string | null;
  message: string | null;
  options?: Record<string, unknown>;
  base?: unknown;
}

export class NestedError extends ActiveModelNestedError {
  private readonly _association: AssociationLike;

  /** @inventedArm create — PERMANENT */
  constructor(association: AssociationLike, innerError: InnerErrorLike) {
    const self: NestedError = Object.assign(Object.create(NestedError.prototype) as NestedError, {
      _association: association,
      innerError,
    });
    super(association.owner, innerError, { attribute: computeAttribute.call(self, innerError) });
    this._association = association;
  }

  /** @internal */
  get association(): AssociationLike {
    return this._association;
  }
}

/** @internal */
function computeAttribute(this: NestedError, innerError: InnerErrorLike): string {
  const associationName = underscore(this.association.reflection.name);

  if (
    this.association.isCollection() &&
    rtest(indexErrorsSetting.call(this)) &&
    index.call(this) != null
  ) {
    return stringToSym(`${associationName}[${index.call(this)}].${toS(innerError.attribute)}`);
  } else {
    return stringToSym(`${associationName}.${toS(innerError.attribute)}`);
  }
}

/** @internal */
function indexErrorsSetting(this: NestedError): boolean | "nestedAttributesOrder" {
  const opts = this.association.options ?? this.association.reflection.options;
  if (opts && "indexErrors" in opts) {
    return opts["indexErrors"] as boolean | "nestedAttributesOrder";
  }
  return indexNestedAttributeErrors();
}

/** @internal */
function index(this: NestedError): number | undefined {
  const records = orderedRecords.call(this);
  const base = (this.innerError as InnerErrorLike).base;
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
