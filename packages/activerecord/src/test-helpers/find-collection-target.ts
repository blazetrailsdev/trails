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
 *
 * `scope` is positional ahead of `options`, as on the macros it stands in for
 * (`has_many(name, scope = nil, **options)`, `associations.rb:1302`), and is
 * folded into the holder's options the same way `Builder::Association.build`
 * folds it into the reflection's (`builder/association.ts:151`) — which is what
 * a caller forwarding a whole `reflection.options` is already passing.
 */
export async function findCollectionTarget(
  record: Base,
  name: string,
  scope: NonNullable<AssociationOptions["scope"]> | AssociationOptions | null = {},
  options: AssociationOptions = {},
): Promise<Base[]> {
  if (typeof scope === "function") {
    options = { ...options, scope };
  } else if (scope !== null) {
    options = scope;
  }
  const assoc = _buildAssociationInstance.call(record, { name, type: "hasMany", options });
  return (assoc as unknown as { findTarget(): Promise<Base[]> }).findTarget();
}
