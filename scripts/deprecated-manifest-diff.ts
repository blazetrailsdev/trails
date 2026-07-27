/**
 * Compares a committed deprecation-parity manifest against a fresh recompute.
 *
 * Split out from the emitter so the comparison is unit-testable without
 * scanning the vendored Ruby tree or touching the tracked manifest.
 *
 * `lost` is called out separately from plain drift because it is the specific
 * failure mode a partial regeneration produces: the manifest is written as a
 * whole-file replace, so an entry that was not re-derived simply disappears,
 * and with it the `rails-deprecated-jsdoc` coverage for that method.
 */
export interface DeprecatedManifest {
  files: Record<string, string[]>;
}

export interface ManifestDiff {
  /** Entries the recompute produced that the committed manifest lacks. */
  lost: string[];
  /** Entries the committed manifest carries that the recompute did not produce. */
  extra: string[];
  /** True when the committed manifest is not identical to the recompute. */
  drifted: boolean;
}

function entries(manifest: DeprecatedManifest): Set<string> {
  const out = new Set<string>();
  for (const [file, names] of Object.entries(manifest.files ?? {})) {
    for (const name of names) out.add(`${file}: ${name}`);
  }
  return out;
}

export function diffDeprecatedManifest(
  expected: DeprecatedManifest,
  actual: DeprecatedManifest,
): ManifestDiff {
  const want = entries(expected);
  const have = entries(actual);
  const lost = [...want].filter((e) => !have.has(e)).sort();
  const extra = [...have].filter((e) => !want.has(e)).sort();
  // Byte-level formatting is gated separately by `prettier --check .`, so
  // compare the serialized data — both sides are emitted with sorted keys, and
  // a hand-reordered file is drift from the generator either way.
  const drifted = JSON.stringify(actual) !== JSON.stringify(expected);
  return { lost, extra, drifted };
}
