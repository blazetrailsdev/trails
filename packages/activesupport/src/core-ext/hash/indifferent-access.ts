import { HashWithIndifferentAccess } from "../../hash-with-indifferent-access.js";

type AnyObject = Record<string, unknown>;

/**
 * Returns a HashWithIndifferentAccess out of its receiver — Ruby's
 * `Hash#with_indifferent_access` (core_ext/hash/indifferent_access.rb:9-11).
 * The receiver is the first argument here because TypeScript has no way to
 * define the method on `Object.prototype`.
 */
export function withIndifferentAccess(obj: AnyObject): HashWithIndifferentAccess<unknown> {
  return new HashWithIndifferentAccess(obj);
}

/**
 * `alias nested_under_indifferent_access with_indifferent_access`
 * (core_ext/hash/indifferent_access.rb:23).
 */
export const nestedUnderIndifferentAccess = withIndifferentAccess;
