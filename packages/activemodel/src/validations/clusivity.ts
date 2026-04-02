/**
 * Clusivity — shared logic for inclusion/exclusion validators.
 *
 * Mirrors: ActiveModel::Validations::Clusivity
 *
 * In Rails, Clusivity is a module included by both InclusionValidator
 * and ExclusionValidator. It provides check_validity! which ensures
 * the :in option is an enumerable, and the include?/exclude? membership test.
 */
export interface Clusivity {
  checkValidity(): void;
}

export function checkValidityBang(options: { in?: unknown }): void {
  checkClusivityValidity(options);
}

export function checkClusivityValidity(options: { in?: unknown }): void {
  const collection = options.in;
  if (collection === undefined || collection === null) {
    throw new Error("An :in option must be supplied (either an Array, a Range, or a Proc)");
  }
  if (
    !Array.isArray(collection) &&
    typeof collection !== "function" &&
    !(typeof collection === "object" && Symbol.iterator in (collection as object))
  ) {
    throw new Error("An :in option must be supplied (either an Array, a Range, or a Proc)");
  }
}

export function isMember(
  collection: unknown[] | (() => unknown[]) | Iterable<unknown>,
  value: unknown,
): boolean {
  const resolved = typeof collection === "function" ? collection() : collection;

  if (Array.isArray(resolved)) return resolved.includes(value);

  if (resolved instanceof Set) return resolved.has(value);

  for (const item of resolved as Iterable<unknown>) {
    if (item === value) return true;
  }

  return false;
}
