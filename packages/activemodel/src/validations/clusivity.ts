import { resolveValue } from "./resolve-value.js";
import { ArgumentError } from "../attribute-assignment.js";
import {
  Range,
  rbCDate,
  rbCDateTime,
  rbCNumeric,
  rbCTime,
  rbFPublicSend,
  rbObjIsKindOf,
  rbObjRespondTo,
  rtest,
} from "@blazetrails/ruby-compat";

export { resolveValue };

export const ERROR_MESSAGE =
  "An object with the method #include? or a proc, lambda or symbol is required, " +
  "and must be supplied as the :in (or :within) option of the configuration hash";

export interface Clusivity {
  checkValidityBang(): void;
  resolveValue(record: unknown, value: unknown): unknown;
  /** @internal */
  delimiter(): unknown;
  /** @internal */
  inclusionMethod(enumerable: unknown): "isInclude" | "cover";
  /** @internal */
  isInclude(record: unknown, value: unknown): boolean;
}

interface ClusivityHost {
  options: Record<string, unknown>;
  resolveValue(record: unknown, value: unknown): unknown;
  /** @internal */
  delimiter(): unknown;
  /** @internal */
  inclusionMethod(enumerable: unknown): "isInclude" | "cover";
  _delimiterCache?: unknown;
}

export function checkValidityBang(this: ClusivityHost): void {
  if (
    !(
      rbObjRespondTo(this.delimiter(), "isInclude") ||
      rbObjRespondTo(this.delimiter(), "call") ||
      rbObjRespondTo(this.delimiter(), "toSym")
    )
  ) {
    throw new ArgumentError(ERROR_MESSAGE);
  }
}

/** @internal */
export function isInclude(this: ClusivityHost, record: unknown, value: unknown): boolean {
  const members = this.resolveValue(record, this.delimiter());

  if (Array.isArray(value)) {
    return value.every((v) => rtest(rbFPublicSend(members, this.inclusionMethod(members), v)));
  } else {
    return rtest(rbFPublicSend(members, this.inclusionMethod(members), value));
  }
}

/** @internal */
export function delimiter(this: ClusivityHost): unknown {
  return rtest(this._delimiterCache)
    ? this._delimiterCache
    : (this._delimiterCache = rtest(this.options.in) ? this.options.in : this.options.within);
}

/** @internal */
export function inclusionMethod(enumerable: unknown): "isInclude" | "cover" {
  if (enumerable instanceof Range) {
    const endpoint = rtest(enumerable.begin) ? enumerable.begin : enumerable.end;
    switch (true) {
      case rbObjIsKindOf(endpoint, rbCNumeric):
      case rbObjIsKindOf(endpoint, rbCTime):
      case rbObjIsKindOf(endpoint, rbCDateTime):
      case rbObjIsKindOf(endpoint, rbCDate):
        return "cover";
      default:
        return "isInclude";
    }
  } else {
    return "isInclude";
  }
}
