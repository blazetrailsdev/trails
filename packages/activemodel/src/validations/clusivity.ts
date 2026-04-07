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

export function checkValidityBang(options: { in?: unknown; within?: unknown }): void {
  checkClusivityValidity(options);
}

export function checkClusivityValidity(options: { in?: unknown; within?: unknown }): void {
  const collection = options.in ?? options.within;
  if (collection === undefined || collection === null) {
    throw new Error(
      "An :in or :within option must be supplied (either an Array, a Range, or a Proc)",
    );
  }
  if (
    !Array.isArray(collection) &&
    typeof collection !== "function" &&
    !(
      typeof collection === "object" &&
      Symbol.iterator in (collection as object) &&
      typeof (collection as Record<symbol, unknown>)[Symbol.iterator] === "function"
    )
  ) {
    throw new Error(
      "An :in or :within option must be supplied (either an Array, a Range, or a Proc)",
    );
  }
}

export function isMember(
  collection: unknown[] | (() => unknown[]) | Iterable<unknown>,
  value: unknown,
): boolean {
  const resolved = typeof collection === "function" ? collection() : collection;

  // Rails: if value is an array, check that all elements are members
  if (Array.isArray(value)) {
    return value.every((v) => isMemberSingle(resolved, v));
  }

  return isMemberSingle(resolved, value);
}

export function isExcluded(
  collection: unknown[] | (() => unknown[]) | Iterable<unknown>,
  value: unknown,
): boolean {
  const resolved = typeof collection === "function" ? collection() : collection;

  // Exclusion: if value is an array, fail when ANY element is in the excluded set
  if (Array.isArray(value)) {
    return value.some((v) => isMemberSingle(resolved, v));
  }

  return isMemberSingle(resolved, value);
}

function isMemberSingle(resolved: unknown[] | Iterable<unknown>, value: unknown): boolean {
  if (Array.isArray(resolved)) return resolved.includes(value);

  if (resolved instanceof Set) return resolved.has(value);

  for (const item of resolved as Iterable<unknown>) {
    if (item === value) return true;
  }

  return false;
}
