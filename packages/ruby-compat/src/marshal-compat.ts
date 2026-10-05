/**
 * The compat table of `vendor/ruby/v3.3.11/marshal.c:120-169`, apart from
 * marshal.ts and with no imports: rational.ts registers into it at load, and
 * marshal.ts reaches rational.ts through numeric.ts, so an import of marshal.ts
 * there closes a cycle that evaluates include.ts ahead of object.ts.
 */

type AnyClass = abstract new (...args: never) => unknown;

/**
 * `marshal_compat_t` (`vendor/ruby/v3.3.11/marshal.c:120`).
 *
 * @noRailsEquivalent PERMANENT
 */
export interface MarshalCompatT {
  newclass: AnyClass;
  oldclass: AnyClass;
  dumper: (obj: object) => object;
  loader: (self: object, a: object) => unknown;
}

let compatAllocatorTbl: Map<AnyClass, MarshalCompatT> | undefined;

/**
 * `compat_allocator_table` (`vendor/ruby/v3.3.11/marshal.c:2595`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function compatAllocatorTable(): Map<AnyClass, MarshalCompatT> {
  if (compatAllocatorTbl) return compatAllocatorTbl;
  compatAllocatorTbl = new Map();
  return compatAllocatorTbl;
}

/**
 * `rb_marshal_define_compat` (`vendor/ruby/v3.3.11/marshal.c:151`). A JS class
 * has no allocator function apart from itself, so `newclass` is the table key.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbMarshalDefineCompat(
  newclass: AnyClass,
  oldclass: AnyClass,
  dumper: (obj: object) => object,
  loader: (self: object, a: object) => unknown,
): void {
  const compat: MarshalCompatT = { newclass, oldclass, dumper, loader };

  compatAllocatorTable().set(newclass, compat);
}
