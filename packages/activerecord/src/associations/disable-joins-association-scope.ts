import { AssociationScope, type ValueTransformation } from "./association-scope.js";

/**
 * Builds scopes for associations that disable joins, querying each
 * database separately and stitching results in memory.
 *
 * PR 1 placeholder: `scope()` is inherited from `AssociationScope`
 * (chain length 1) and the static dispatch is polymorphic via
 * `this.INSTANCE`, so `DisableJoinsAssociationScope.scope(association)`
 * routes through this class' own INSTANCE. The real disable-joins
 * scope-building logic (`scope()` override + multi-step stitching)
 * lands in PR 4 — when it does, this subclass picks up its own
 * `scope()` override automatically.
 *
 * Mirrors: ActiveRecord::Associations::DisableJoinsAssociationScope
 */
export class DisableJoinsAssociationScope extends AssociationScope {
  /**
   * Subclass INSTANCE so the polymorphic `static scope` on the parent
   * (`this.INSTANCE.scope(association)`) routes through a
   * DisableJoinsAssociationScope rather than the base AssociationScope
   * INSTANCE. PR 4 will override `scope()` here for real disable-joins
   * behavior.
   */
  static override readonly INSTANCE: DisableJoinsAssociationScope =
    DisableJoinsAssociationScope.create();

  constructor(valueTransformation: ValueTransformation = (v) => v) {
    super(valueTransformation);
  }
}
