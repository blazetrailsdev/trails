/**
 * Shared id-normalization + error-shape helpers for AR finders.
 *
 * Both `Relation.performFind` (SQL path) and
 * `CollectionProxy#find` (in-memory association path) accept the
 * same polymorphic arg set — `find(1)`, `find(1, 2)`, `find([1, 2])`,
 * `find([k1, k2])` on a composite PK, `find([[k1, k2], [k3, k4]])`,
 * zero-arg, empty-list, arity-mismatch — and must produce identical
 * `RecordNotFound` messages and `.id` payloads. Centralizing the
 * normalization + raise helpers here prevents the two paths from
 * drifting as the API evolves.
 *
 * Simple-PK flattening note: we use `flat(Infinity)` (fully
 * recursive), not `flat(1)`. This matches Ruby's `Array#flatten`
 * default, which is Rails' contract (`Post.find([[1, [2]]])` works
 * as `Post.find(1, 2)`). The previous TS `performFind` only
 * flattened one level — this unifies behavior with Rails.
 *
 * Mirrors: ActiveRecord::FinderMethods shared argument handling.
 */

import { RecordNotFound } from "../errors.js";

export interface NormalizedFindIds {
  /**
   * Canonical id list for the lookup backend:
   *   - simple PK → flat scalar ids (never arrays).
   *   - composite PK → array of tuples (always `unknown[][]`).
   */
  readonly ids: unknown[];

  /**
   * `true` when the caller provided a list-form (variadic ≥2, a
   * single array arg, or composite list-of-tuples) and therefore
   * wants `T[]` back. `false` for the single-id / single-tuple case.
   */
  readonly wantArray: boolean;

  /**
   * For composite PKs: the tuple list (same shape as `ids`). For
   * simple PKs: `null`. Used to format error messages + payload
   * exactly like Rails (`String(tuples)` vs `flatIds.join(", ")`).
   */
  readonly tuples: unknown[][] | null;
}

/**
 * Normalize the varargs of a `.find(...)` call into the canonical
 * `NormalizedFindIds` shape.
 *
 * Raises `RecordNotFound` for the deterministic input errors:
 *   - zero-arg call                     → "empty list of ids", `id: []`
 *   - explicit `find([])`               → same
 *   - composite PK + scalar or wrong-arity tuple →
 *     "`<Model>: composite primary key requires a <N>-element array, got <id>`"
 *
 * Does NOT do the actual lookup or the "couldn't find all" aggregate
 * error — that stays at the call site (SQL vs in-memory each have
 * their own count-comparison logic).
 */
export function normalizeFindArgs(
  modelName: string,
  pk: string | string[],
  args: unknown[],
): NormalizedFindIds {
  const composite = Array.isArray(pk);

  // Zero-arg: matches Relation.performFind's empty-list contract
  // (message + id=[]).
  if (args.length === 0) {
    throw new RecordNotFound(
      `Couldn't find ${modelName} with an empty list of ids`,
      modelName,
      String(pk),
      [],
    );
  }

  const [first, ...rest] = args;
  let ids: unknown[];
  let wantArray: boolean;

  if (rest.length > 0) {
    // Variadic.
    if (composite) {
      if (args.every((x) => !Array.isArray(x))) {
        // All-scalar collapses to one tuple id — Rails treats
        // `find(1, 42)` on a 2-arity PK as `[1, 42]`. Arity mismatch
        // raises below with the whole tuple in the message.
        ids = [args];
        wantArray = false;
      } else {
        // Any array arg signals tuples-of-tuples (list form).
        ids = args;
        wantArray = true;
      }
    } else {
      // Simple PK: flatten everything so mixed inputs like
      // `find([1, 2], 3)` canonicalize to `[1, 2, 3]`, keeping the
      // "simple PK ids are scalar" contract.
      ids = (args as unknown[]).flat(Infinity);
      wantArray = true;
    }
  } else if (Array.isArray(first)) {
    if (composite) {
      // Empty array → fall through to the empty-list error.
      // Scalar-only non-empty array → ONE tuple (whatever its
      // arity). Wrong arity reports the whole tuple.
      // Array-of-arrays → list of tuples.
      if (first.length === 0) {
        ids = first;
        wantArray = true;
      } else if (first.every((x) => !Array.isArray(x))) {
        ids = [first];
        wantArray = false;
      } else {
        ids = first;
        wantArray = true;
      }
    } else {
      // Simple PK: recursive flatten so `find([[1, 2]])` behaves like
      // `find([1, 2])`, matching Rails' behavior via Array#flatten.
      ids = (first as unknown[]).flat(Infinity);
      wantArray = true;
    }
  } else {
    ids = [first];
    wantArray = false;
  }

  // Empty after normalization (`find([])`, composite fallthrough).
  if (ids.length === 0) {
    throw new RecordNotFound(
      `Couldn't find ${modelName} with an empty list of ids`,
      modelName,
      String(pk),
      [],
    );
  }

  if (composite) {
    const pkArity = (pk as string[]).length;
    for (const id of ids) {
      if (!Array.isArray(id) || id.length !== pkArity) {
        throw new RecordNotFound(
          `${modelName}: composite primary key requires a ${pkArity}-element array, got ${String(id)}`,
          modelName,
          String(pk),
          id,
        );
      }
    }
    return { ids, wantArray, tuples: ids as unknown[][] };
  }

  return { ids, wantArray, tuples: null };
}

/**
 * Raise the aggregate "couldn't find all" error, matching
 * `Relation.performFind`'s message shape for the caller's PK kind:
 *   - simple PK  → `flatIds.join(", ")`, payload = flatIds.
 *   - composite  → `String(tuples)`    , payload = tuples[][].
 */
export function raiseNotFoundAll(
  modelName: string,
  pk: string | string[],
  normalized: NormalizedFindIds,
): never {
  const { ids, tuples } = normalized;
  const messageIds = tuples ? String(tuples) : (ids as unknown[]).join(", ");
  const payload = tuples ?? ids;
  throw new RecordNotFound(
    `Couldn't find all ${modelName} with '${String(pk)}': (${messageIds})`,
    modelName,
    String(pk),
    payload,
  );
}

/**
 * Raise the single-id not-found error for a simple PK.
 * Matches `Relation.performFind`'s `"with 'pk'=<id>"` message.
 */
export function raiseNotFoundSingle(modelName: string, pk: string, id: unknown): never {
  throw new RecordNotFound(
    `Couldn't find ${modelName} with '${pk}'=${String(id)}`,
    modelName,
    pk,
    id,
  );
}
