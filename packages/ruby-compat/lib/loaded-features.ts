/** @noRailsEquivalent PERMANENT — `$"`, `vendor/ruby/v3.3.11/load.c:1606`. */
export const LOADED_FEATURES: string[] = [];
/** @noRailsEquivalent PERMANENT — `get_loading_table`, `vendor/ruby/v3.3.11/load.c:207`. */
export const loadingTable = new Set<string>();

/**
 * `rb_feature_provided` (`vendor/ruby/v3.3.11/load.c:695`) for an expanded
 * path: true once the feature is in `$LOADED_FEATURES`, or while it is
 * being required (`feature_provided`'s loading-table arm).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbFeatureProvided(feature: string): boolean {
  return LOADED_FEATURES.includes(feature) || loadingTable.has(feature);
}
