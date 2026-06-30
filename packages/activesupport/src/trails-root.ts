/**
 * `Trails.root` — the trails equivalent of Rails' `Rails.root`.
 *
 * Rails references `Rails.root` as an *optional* dependency: path-resolution
 * sites (e.g. `SQLite3Adapter#initialize`) expand relative paths against it
 * only `if defined?(Rails.root)`, falling back to the raw path otherwise.
 *
 * trails has no framework layer baked into ActiveRecord, so we model the same
 * optional seam as an injectable global on activesupport. trailties' boot sets
 * it from its resolved application root; bare ActiveRecord usage leaves it
 * unset, in which case path sites fall back to the working directory.
 */

let appRoot: string | null = null;

/** The application root, or `null` when unset (bare ActiveRecord usage). */
export function trailsRoot(): string | null {
  return appRoot;
}

/**
 * Set (or clear) the application root. trailties' `Application` boot calls this
 * with its resolved `requireRoot()`. Pass `null` to clear (mainly for tests).
 */
export function setTrailsRoot(root: string | null): void {
  appRoot = root;
}

/**
 * `Trails` namespace — mirrors Rails' `Rails` module. Only `root` is modeled
 * today; it is the optional app-root seam ActiveRecord reads for path
 * resolution.
 */
export const Trails = {
  get root(): string | null {
    return appRoot;
  },
  set root(value: string | null) {
    appRoot = value;
  },
};
