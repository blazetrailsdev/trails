import type { Base } from "../base.js";
import type { AssociationOptions } from "../associations.js";
import { _buildAssociationInstance } from "../associations/instance-methods.js";

/**
 * Runs a has_many load the way `CollectionProxy` and the through loaders do —
 * `find_target` (`association.rb:248`) on an association holder — for an
 * options set that is not necessarily the declared one.
 *
 * The holder is built fresh rather than taken from `record.association(name)`
 * so the load leaves the record's real holder (its loadedness, its writeback
 * suppression, its inverse wiring) untouched, which is what these tests want
 * when they drive the loader directly.
 *
 * Test-only sugar: `find_target` is protected, as in Rails, so every call site
 * would otherwise repeat the same cast. `async` so `check_validity!` — run when
 * the holder is built, as in `Association#initialize` (`association.rb:41-45`) —
 * surfaces as a rejection like every other load failure.
 */
export async function findCollectionTarget(
  record: Base,
  name: string,
  options: AssociationOptions = {},
): Promise<Base[]> {
  const assoc = _buildAssociationInstance.call(record, { name, type: "hasMany", options });
  return (assoc as unknown as { findTarget(): Promise<Base[]> }).findTarget();
}
