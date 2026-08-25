import type { Base } from "../base.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import { _buildAssociationInstance } from "../associations/instance-methods.js";

/**
 * Runs a has_many load the way `CollectionProxy` and the through loaders do —
 * `load_target` (`association.rb:189-195`) on an association holder — for an
 * options set that is not necessarily the declared one.
 *
 * The holder is built fresh rather than taken from `record.association(name)`
 * so the load leaves the record's real holder (its loadedness, its writeback
 * suppression, its inverse wiring) untouched, which is what these tests want
 * when they drive the loader directly.
 *
 * Test-only sugar: every call site would otherwise repeat the same cast.
 * `async` so `check_validity!` — run when
 * the holder is built, as in `Association#initialize` (`association.rb:41-45`) —
 * surfaces as a rejection like every other load failure.
 *
 * `scope` is positional ahead of `options`, as on the macros it stands in for
 * (`has_many(name, scope = nil, **options)`, `associations.rb:1302`), and is
 * kept beside the options the same way `Builder::Association.createReflection`
 * keeps it beside the reflection's (`association.rb:48-49`) — the options hash
 * never carries it, so a caller forwarding a whole `reflection.options` passes
 * options only.
 */
type AssociationScopeLambda = NonNullable<AssociationDefinition["scope"]>;

export async function findCollectionTarget(
  record: Base,
  name: string,
  scope: AssociationScopeLambda | AssociationOptions | null = {},
  options: AssociationOptions = {},
): Promise<Base[]> {
  let positionalScope: AssociationScopeLambda | null = null;
  if (typeof scope === "function") {
    positionalScope = scope;
  } else if (scope !== null) {
    options = scope;
  }
  const assoc = _buildAssociationInstance.call(record, {
    name,
    type: "hasMany",
    scope: positionalScope,
    options,
  });
  // `load_target` rather than `find_target`: the `find_target?` gate lives
  // there (association.rb:190), and `CollectionProxy` now loads through it too.
  const loaded = await (
    assoc as unknown as { loadTarget(): Promise<Base[] | Base | null> | Base[] | Base | null }
  ).loadTarget();
  return (loaded ?? []) as Base[];
}
