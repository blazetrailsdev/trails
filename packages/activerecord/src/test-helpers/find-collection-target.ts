import type { Base } from "../base.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import { _buildAssociationInstance } from "../associations/instance-methods.js";

/**
 * Runs a has_many load the way `CollectionProxy` does — `find_target?`
 * (`association.rb:190`) decides whether to query, `find_target`
 * (`association.rb:248`) does the querying — for an options set that is not
 * necessarily the declared one.
 *
 * As in `CollectionProxy._findTargetViaAssociation`, the gate is read off the
 * owner's own holder (whose reflection answers `klass` and
 * `active_record_primary_key`) while the load runs on a holder built fresh, so
 * it leaves the record's real holder — its loadedness, its writeback
 * suppression, its inverse wiring — untouched, which is what these tests want
 * when they drive the loader directly. A `name` the owner never declared has no
 * real holder and so no `find_target?` to consult: Rails has no association
 * without a reflection, and that inline-fallback shape is trails-only.
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
  const declared = (
    record.constructor as unknown as {
      _reflectOnAssociation?: (n: string) => unknown;
    }
  )._reflectOnAssociation?.(name);
  if (declared) {
    const holder = (
      record as unknown as {
        association(n: string): { findTargetNeeded(): boolean; target: Base[] };
      }
    ).association(name);
    // `load_target` answers `target` whether or not `find_target?` sent it to
    // the database (association.rb:189-195), so an already-loaded holder
    // reports what it holds rather than an empty list.
    if (!holder.findTargetNeeded()) return holder.target ?? [];
  }
  const assoc = _buildAssociationInstance.call(record, {
    name,
    type: "hasMany",
    scope: positionalScope,
    options,
  });
  return (assoc as unknown as { findTarget(): Promise<Base[]> }).findTarget();
}
