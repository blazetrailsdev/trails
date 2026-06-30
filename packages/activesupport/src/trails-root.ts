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

/**
 * The published root: a static path, `null` (unset), or a live getter.
 * trailties registers a getter so the seam tracks `config.root` changes after
 * boot, mirroring Rails' `Rails.root` being a live read of
 * `application.config.root`. Tests inject a static string directly.
 */
export type TrailsRootSource = string | null | (() => string | null);

let source: TrailsRootSource = null;

/** The application root, or `null` when unset (bare ActiveRecord usage). */
export function trailsRoot(): string | null {
  return typeof source === "function" ? source() : source;
}

/**
 * Set (or clear) the application root. trailties' `Application` boot passes a
 * getter (`() => app.config.root ?? bootRoot`) so a later `config.setRoot(...)`
 * stays visible — Rails reads `Rails.root` live. Pass a string for a static
 * value or `null` to clear (mainly for tests).
 */
export function setTrailsRoot(root: TrailsRootSource): void {
  source = root;
}
