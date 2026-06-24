/**
 * Extractor-version skew detection for the cross-version drift report.
 *
 * `pnpm api:drift` diffs a pinned base manifest (`output/rails-api.json`, last
 * produced by `pnpm api:compare`) against a freshly-extracted target. If the
 * base was built by a DIFFERENT version of `extract-ruby-api.rb` than the
 * target, the diff conflates extractor-version drift with real Rails drift —
 * observed live as call-set changes jumping 545 → 1627 with no Rails change,
 * purely from a stale base after the extractor was edited upstream.
 *
 * Both manifests now carry an `extractorHash` (the extractor's content hash;
 * see extract-ruby-api.rb). This pure check compares them so the report can
 * rebuild a stale base or abort instead of silently emitting a conflated diff.
 *
 * Pure (no fs, no clone) so it's unit-testable directly.
 */
import type { ApiManifest } from "./types.js";

export interface ExtractorSkew {
  /** True when base and target were built by different extractor versions. */
  skewed: boolean;
  baseHash: string | undefined;
  targetHash: string | undefined;
}

/**
 * Compare the extractor identity stamped into two manifests. A missing hash on
 * either side (a manifest written before the field existed) is treated as a
 * mismatch: we can't prove the extractor matched, and a stale pre-field base is
 * exactly the case this guard exists to catch.
 */
export function detectExtractorSkew(base: ApiManifest, target: ApiManifest): ExtractorSkew {
  const baseHash = base.extractorHash;
  const targetHash = target.extractorHash;
  const skewed = baseHash === undefined || targetHash === undefined || baseHash !== targetHash;
  return { skewed, baseHash, targetHash };
}

/** Human-readable explanation of a detected skew, for abort/log messages. */
export function describeExtractorSkew(skew: ExtractorSkew): string {
  const base = skew.baseHash ?? "(none — pre-extractorHash manifest)";
  const target = skew.targetHash ?? "(none — pre-extractorHash manifest)";
  return (
    `base manifest extractor ${base} != target extractor ${target}. The base ` +
    `(output/rails-api.json) was built by a different extractor than the target, ` +
    `so the diff would conflate extractor-version drift with real Rails drift.`
  );
}
