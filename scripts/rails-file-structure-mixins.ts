/**
 * Mixin-module resolution for the rails-file-structure method-order manifest.
 *
 * Rails frequently defines a concern's per-instance / per-class API in nested
 * `InstanceMethods` / `ClassMethods` modules that are `include`d / `extend`ed
 * into a surrounding container. When that container is a CLASS ported 1:1 to a
 * TS class, the mixin's methods flatten onto that class rather than living as
 * standalone top-level functions — so their source order belongs on the class
 * container, not the manifest's `functions` bucket (which no class body reads).
 *
 * `ActiveModel::Type::Helpers::AcceptsMultiparameterTime::InstanceMethods` is
 * the live case: `class AcceptsMultiparameterTime < Module` mixes in its
 * `InstanceMethods` sub-module, and trails ports the whole thing as
 * `export class AcceptsMultiparameterTime`.
 *
 * Restricting to the two canonical mixin-module names keeps the mapping 1:1 and
 * unambiguous — an arbitrarily-named module nested under a class is NOT swept
 * onto it.
 *
 * Constraints: no `node:` specifiers, no `process` references.
 */

export interface MixinParent {
  /** Last segment of the parent class's fqn — the TS class bucket key. */
  className: string;
  /** Parent class fqn, for operator-spelling / collision bookkeeping. */
  parentFqn: string;
  /**
   * `ClassMethods` is mixed via `extend`, promoting its instance methods to the
   * target's singleton — the manifest records those as `static`.
   */
  extendsSingleton: boolean;
}

/**
 * If `moduleFqn` names a `<Class>::InstanceMethods` / `<Class>::ClassMethods`
 * mixin whose parent is a known class, return where its methods flatten;
 * otherwise null (a standalone module ported to top-level functions).
 */
export function resolveMixinParent(
  moduleFqn: string,
  isClassFqn: (fqn: string) => boolean,
): MixinParent | null {
  const segments = moduleFqn.split("::");
  const last = segments[segments.length - 1];
  if (last !== "InstanceMethods" && last !== "ClassMethods") return null;
  const parentFqn = segments.slice(0, -1).join("::");
  if (!parentFqn || !isClassFqn(parentFqn)) return null;
  const parentSegments = parentFqn.split("::");
  return {
    className: parentSegments[parentSegments.length - 1] ?? parentFqn,
    parentFqn,
    extendsSingleton: last === "ClassMethods",
  };
}
