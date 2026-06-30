/**
 * Injectable application-root seam — the activesupport-level counterpart of
 * Rails' `Rails.root`.
 *
 * Rails references `Rails.root` as an *optional* dependency: path-resolution
 * sites (e.g. `SQLite3Adapter#initialize`) expand relative paths against it
 * only `if defined?(Rails.root)`, falling back to the raw path otherwise. The
 * canonical `Trails.root` accessor lives one layer up in `@blazetrails/trailties`
 * (the `railties/lib/rails.rb` port); ActiveRecord cannot depend on trailties,
 * so this neutral registry is the seam it reads. trailties' `Application` boot
 * publishes its resolved root here; bare ActiveRecord usage leaves it unset, in
 * which case path sites fall back to the working directory.
 */

let appRoot: string | null = null;

/** The application root, or `null` when unset (bare ActiveRecord usage). */
export function trailsRoot(): string | null {
  return appRoot;
}

/**
 * Set (or clear) the application root. trailties' `Application` boot calls this
 * with its resolved root. Pass `null` to clear (mainly for tests).
 */
export function setTrailsRoot(root: string | null): void {
  appRoot = root;
}
