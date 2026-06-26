// Shared helper for resolving the target class name of an association
// call. Used by both `synthesize.ts` (to emit `declare` types) and
// `tsc-wrapper/auto-import.ts` (to decide which `import type` lines to
// inject). Keeping the logic in one place ensures the emitted declares
// and the auto-imports can't drift.

import { classify, singularize } from "@blazetrails/activesupport";
import type { AssociationCall } from "./walker.js";

export function resolveAssociationTarget(call: AssociationCall): string {
  const explicit = call.options["className"];
  if (explicit) return stripQuotes(explicit);
  return classify(call.name);
}

/** A model's association calls by class name (cross-file model registry). */
export type ModelAssociationLookup = (className: string) => readonly AssociationCall[] | undefined;

/**
 * Resolve a `has_many`/`has_one :x, through: :y` target by following Rails'
 * through→source reflection chain — the element type is the SOURCE class on the
 * through model (`Comment`), not `classify(name)` (`CommentsWithOrder`). `lookup`
 * resolves other models by class name. `undefined` when unresolvable.
 */
export function resolveThroughTarget(
  definingAssocs: readonly AssociationCall[],
  call: AssociationCall,
  lookup: ModelAssociationLookup,
  aliases?: ReadonlyMap<string, string>,
  seen: Set<string> = new Set(),
): string | undefined {
  const throughRaw = call.options["through"];
  if (!throughRaw) return undefined;
  const throughName = stripQuotes(throughRaw);
  // Guard against a self-referential through chain so recursion terminates.
  const guard = `${throughName}\u0000${call.name}`;
  if (seen.has(guard)) return undefined;
  seen.add(guard);

  // Rails reflection.rb#derive_class_name: `source_type:` (disambiguating a
  // polymorphic source) wins over the source class, so honor it first.
  const sourceType = call.options["sourceType"];
  if (sourceType) return resolveAlias(stripQuotes(sourceType), aliases);

  const throughAssoc = definingAssocs.find((a) => a.name === throughName);
  if (!throughAssoc) return undefined;
  const throughModel = targetClassOf(definingAssocs, throughAssoc, lookup, aliases, seen);
  if (!throughModel) return undefined;
  const throughModelAssocs = lookup(throughModel);
  if (!throughModelAssocs) return undefined;

  // Rails source-reflection name (reflection.rb#source_reflection_names):
  // `source:` if given, else the singularized then plural association name.
  const sourceRaw = call.options["source"];
  const candidates = sourceRaw ? [stripQuotes(sourceRaw)] : [singularize(call.name), call.name];
  for (const candidate of candidates) {
    const source = throughModelAssocs.find((a) => a.name === candidate);
    if (source) return targetClassOf(throughModelAssocs, source, lookup, aliases, seen);
  }
  return undefined;
}

/**
 * The target class of a single association — explicit `className`, a nested
 * `through` (recursed), or `classify(name)` — mapped through the in-file
 * `registerModel` alias map.
 */
function targetClassOf(
  definingAssocs: readonly AssociationCall[],
  assoc: AssociationCall,
  lookup: ModelAssociationLookup,
  aliases: ReadonlyMap<string, string> | undefined,
  seen: Set<string>,
): string | undefined {
  // A polymorphic source has no single class — `Base` fallback.
  if (assoc.options["polymorphic"] === "true") return "Base";
  const explicit = assoc.options["className"];
  if (explicit) return resolveAlias(stripQuotes(explicit), aliases);
  if (assoc.options["through"])
    return resolveThroughTarget(definingAssocs, assoc, lookup, aliases, seen);
  return resolveAlias(classify(assoc.name), aliases);
}

function resolveAlias(name: string, aliases: ReadonlyMap<string, string> | undefined): string {
  return aliases?.get(name) ?? name;
}

export function stripQuotes(source: string): string {
  const first = source.charAt(0);
  if ((first === '"' || first === "'" || first === "`") && source.endsWith(first)) {
    return source.slice(1, -1);
  }
  return source;
}
