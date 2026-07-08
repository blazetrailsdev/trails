// Shared preload/includes/eager_load folding used by BOTH Merger (merge()) and
// mergeBang (merge!()) so the two paths cannot drift — mirroring how the join
// folds live in merge-joins.ts. Rails' merge! and merge share the one
// Merger#merge code path; trails hand-duplicates the field-by-field copy in
// mergeBang, so the branching logic here lives in one place and applies to both.

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

// Rails merges :eager_load as a NORMAL_VALUE through Merger#merge's generic loop
// (merger.rb:52-68) — it is NOT part of merge_preloads. eager_load!
// (query_methods.rb) always unions (`eager_load_values |= args`), never gated on
// model equality and never nested under a reflection, so it crosses the model
// boundary untouched.
export function foldMergeEagerLoad(target: PreloadFoldRelation, source: PreloadFoldRelation): void {
  const otherEager = source._eagerLoadAssociations ?? [];
  if (otherEager.length > 0) {
    target._eagerLoadAssociations = [...(target._eagerLoadAssociations ?? []), ...otherEager];
  }
}

// Mirrors Rails' Merger#merge_preloads (merger.rb:96-115). Same-model merges
// union the preload/includes values straight across. A cross-model merge (e.g.
// Comment.joins(:post).merge(Post.preload(:readers))) instead nests them under
// the reflection on the receiver whose class_name is the other model's name, so
// Comment preloads `{ post: [:readers] }` — carrying Post's preload through the
// association boundary rather than asking Comment to preload `:readers`.
export function foldMergePreloads(target: PreloadFoldRelation, source: PreloadFoldRelation): void {
  const otherPreloads = source._preloadAssociations ?? [];
  const otherIncludes = source._includesAssociations ?? [];
  if (otherPreloads.length === 0 && otherIncludes.length === 0) return;

  if (source._modelClass === target._modelClass) {
    if (otherPreloads.length > 0) {
      target._preloadAssociations = [...(target._preloadAssociations ?? []), ...otherPreloads];
    }
    if (otherIncludes.length > 0) {
      target._includesAssociations = [...(target._includesAssociations ?? []), ...otherIncludes];
    }
    return;
  }

  const otherName = source._modelClass?.name;
  const reflection = target._modelClass
    .reflectOnAllAssociations()
    .find((r) => r.className === otherName);
  if (!reflection) return;

  if (otherPreloads.length > 0) {
    target._preloadAssociations.push({ [reflection.name]: otherPreloads });
  }
  if (otherIncludes.length > 0) {
    target._includesAssociations.push({ [reflection.name]: otherIncludes });
  }
}
