// Preload/includes/eager_load folding for the single merge path (Merger#merge).
// Both `merge` and `merge!` funnel through Merger now (see spawn-methods.ts), so
// there is one caller; kept as dedicated functions (like merge-joins.ts) so the
// same-model-union / cross-model-reflection-nesting branching stays isolated.

import { structuralUnionEq } from "./query-methods.js";

// Minimal structural view of the preload-related fields these helpers touch.
// Kept local (rather than `any`) so the shared module stays off the
// no-explicit-any burndown allowlist (RFC 0037).
interface PreloadFoldRelation {
  _modelClass: {
    name?: string;
    reflectOnAllAssociations(): Array<{ name: string; className: string }>;
  };
  _preloadAssociations: unknown[];
  _includesAssociations: unknown[];
  _eagerLoadAssociations: unknown[];
}

// Rails unions these association-value arrays with `|=` (preload_values |= …,
// includes_values |= …, eager_load_values |= …), which dedups by eql?/hash —
// structural for Symbol/String/Hash specs alike. Mirror that: append each
// incoming spec only when no structurally-equal entry is already present, so a
// repeated `preload(:x)`/`includes(:x)`/`eager_load(:x)` across a merge folds to
// one, matching Rails rather than pushing duplicate specs the preloader then
// double-loads. Same helper (structuralUnionEq) the join folds use.
function unionAppend(target: unknown[], incoming: readonly unknown[]): void {
  for (const spec of incoming) {
    if (!target.some((seen) => structuralUnionEq(seen, spec))) target.push(spec);
  }
}

// Rails merges :eager_load as a NORMAL_VALUE through Merger#merge's generic loop
// (merger.rb:52-68) — it is NOT part of merge_preloads. eager_load!
// (query_methods.rb:295-297) always unions (`eager_load_values |= args`), never
// gated on model equality and never nested under a reflection, so it crosses the
// model boundary untouched.
export function foldMergeEagerLoad(target: PreloadFoldRelation, source: PreloadFoldRelation): void {
  unionAppend(target._eagerLoadAssociations, source._eagerLoadAssociations ?? []);
}

// Mirrors Rails' Merger#merge_preloads (merger.rb:96-115). Same-model merges
// union the preload/includes values straight across (`|=`). A cross-model merge
// (e.g. Comment.joins(:post).merge(Post.preload(:readers))) instead nests them
// under the reflection on the receiver whose class_name is the other model's
// name, so Comment preloads `{ post: [:readers] }` — carrying Post's preload
// through the association boundary rather than asking Comment to preload
// `:readers`. Rails applies that nested spec via `preload!`/`includes!`, which
// also union (`|=`), so it too dedups against an already-present identical nest.
export function foldMergePreloads(target: PreloadFoldRelation, source: PreloadFoldRelation): void {
  const otherPreloads = source._preloadAssociations ?? [];
  const otherIncludes = source._includesAssociations ?? [];
  if (otherPreloads.length === 0 && otherIncludes.length === 0) return;

  if (source._modelClass === target._modelClass) {
    unionAppend(target._preloadAssociations, otherPreloads);
    unionAppend(target._includesAssociations, otherIncludes);
    return;
  }

  const otherName = source._modelClass?.name;
  const reflection = target._modelClass
    .reflectOnAllAssociations()
    .find((r) => r.className === otherName);
  if (!reflection) return;

  if (otherPreloads.length > 0) {
    unionAppend(target._preloadAssociations, [{ [reflection.name]: otherPreloads }]);
  }
  if (otherIncludes.length > 0) {
    unionAppend(target._includesAssociations, [{ [reflection.name]: otherIncludes }]);
  }
}
