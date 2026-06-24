// Pure gem-level delta for the Rails API drift report: derive the monorepo
// subgem list from gemspec paths and diff two refs' lists into added/removed
// packages. Complements version-diff.ts, which only sees packages present in
// BOTH extracted manifests — so a Rails bump that adds or removes a whole gem
// (one we don't yet mirror in vendor/sources.ts) is invisible there but shows
// up here. Pure (no node:* / process / fs) — drift.ts owns all I/O.

export interface GemListDelta {
  addedPackages: string[];
  removedPackages: string[];
}

/**
 * Derive sorted, de-duplicated gem names from monorepo gemspec paths, e.g.
 * "activerecord/activerecord.gemspec" → "activerecord" and a root
 * "rails.gemspec" → "rails". Paths without a `.gemspec` basename are ignored.
 */
export function gemNamesFromPaths(paths: string[]): string[] {
  const names = new Set<string>();
  for (const p of paths) {
    const match = /(?:^|\/)([^/]+)\.gemspec$/.exec(p);
    if (match) names.add(match[1]);
  }
  return [...names].sort();
}

/** Diff two gem-name lists (base vs target) into added/removed packages. */
export function diffGemList(base: string[], target: string[]): GemListDelta {
  const baseSet = new Set(base);
  const targetSet = new Set(target);
  const addedPackages = [...targetSet].filter((g) => !baseSet.has(g)).sort();
  const removedPackages = [...baseSet].filter((g) => !targetSet.has(g)).sort();
  return { addedPackages, removedPackages };
}
