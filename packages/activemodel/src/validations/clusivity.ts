import { resolveValue } from "./resolve-value.js";
import { ArgumentError, NoMethodError } from "../attribute-assignment.js";
import { Range, rbObjRespondTo } from "@blazetrails/ruby-compat";

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
  inclusionMethod(enumerable: unknown): "include?" | "cover?";
  /** @internal */
  isInclude(record: unknown, value: unknown): boolean;
}

interface ClusivityHost {
  options: Record<string, unknown>;
  resolveValue(record: unknown, value: unknown): unknown;
  /** @internal */
  delimiter(): unknown;
  /** @internal */
  inclusionMethod(enumerable: unknown): "include?" | "cover?";
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
  const method = this.inclusionMethod(members);
  if (Array.isArray(value)) {
    return value.every((v) => testMembership(members, v, method));
  }
  return testMembership(members, value, method);
}

/** @internal */
export function delimiter(this: ClusivityHost): unknown {
  return (this._delimiterCache ??= this.options.in ?? this.options.within);
}

/** @internal */
export function inclusionMethod(enumerable: unknown): "include?" | "cover?" {
  if (enumerable instanceof Range) {
    const endpoint = enumerable.begin ?? enumerable.end;
    // boundary: ruby-compat's `Range` comparators accept JS Date alongside number,
    if (typeof endpoint === "number" || endpoint instanceof Date) return "cover?";
  }
  return "include?";
}

function testMembership(members: unknown, value: unknown, method: "include?" | "cover?"): boolean {
  if (members instanceof Range) {
    if (method === "cover?") return members.cover(value);
    return members.isInclude(value);
  }
  return isMemberOf(members, value);
}

function isMemberOf(members: unknown, value: unknown): boolean {
  if (members === null || members === undefined) {
    throw new NoMethodError(
      `undefined method 'include?' for ${members === null ? "null" : "undefined"}`,
    );
  }
  if (typeof members === "string") {
    return typeof value === "string" && members.includes(value);
  }
  if (members instanceof Set || members instanceof Map) return members.has(value);
  if (Array.isArray(members)) return members.includes(value);
  const m = members as { includes?: (v: unknown) => boolean; has?: (v: unknown) => boolean };
  if (typeof m.includes === "function") return m.includes(value);
  if (typeof m.has === "function") return m.has(value);
  if (typeof (members as Iterable<unknown>)[Symbol.iterator] === "function") {
    for (const item of members as Iterable<unknown>) {
      if (item === value) return true;
    }
    return false;
  }
  return false;
}
