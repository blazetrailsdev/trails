import type { Base } from "../base.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import { _buildAssociationInstance } from "../associations/instance-methods.js";
import { resolveAssocClass } from "../associations.js";
import { camelize, singularize } from "@blazetrails/activesupport";

/**
 * Runs a has_many load the way `CollectionProxy` does — `find_target?`
 * (`association.rb:190`) decides whether to query, `find_target`
 * (`association.rb:248`) does the querying — for an options set that is not
 * necessarily the declared one.
 *
 * As in `CollectionProxy._findTargetViaAssociation`, the gate is read off the
 * holder the record itself keeps (whose loadedness, writeback suppression and
 * inverse wiring the load must not disturb) while the load runs on a holder
 * built fresh, which is what these tests want when they drive the loader
 * directly. A `name` the owner never declared has no such holder, so the gate
 * is read off the fresh one instead: its reflection resolves `klass` from
 * `className` the way the loaders do (`resolveAssocClass`, `associations.ts`),
 * so `find_target?`'s trailing `&& klass` (`association.rb:320-321`) is
 * answerable on every path rather than skipped for that shape.
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
    klass: resolveAssocClass(record, name, options.className ?? camelize(singularize(name))),
  } as never);
  const holder =
    (
      record as unknown as {
        _associationInstances: Map<string, { findTargetNeeded(): boolean; target: Base[] }>;
      }
    )._associationInstances.get(name) ??
    (assoc as unknown as { findTargetNeeded(): boolean; target: Base[] });
  // `load_target` answers `target` whether or not `find_target?` sent it to
  // the database (association.rb:189-195), so an already-loaded holder
  // reports what it holds rather than an empty list.
  if (!holder.findTargetNeeded()) return holder.target ?? [];
  return (assoc as unknown as { findTarget(): Promise<Base[]> }).findTarget();
}
