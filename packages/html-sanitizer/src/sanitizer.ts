// Rails parallel: lib/rails/html/sanitizer.rb -> class Sanitizer.

/**
 * Abstract base for all HTML sanitizers. Mirrors `Rails::HTML::Sanitizer`.
 *
 * Concrete subclasses live next to this file: {@link FullSanitizer},
 * {@link LinkSanitizer}, and (in a follow-up PR) `SafeListSanitizer`.
 */
export abstract class Sanitizer {
  /**
   * Sanitize an HTML fragment. Returns `null` / `undefined` /
   * empty-string unchanged, matching Rails' `ComposedSanitize#sanitize`.
   */
  abstract sanitize(
    html: string | null | undefined,
    options?: SanitizeOptions,
  ): string | null | undefined;
}

/**
 * Options accepted by `Sanitizer#sanitize`. Concrete sanitizers may
 * ignore options they don't honor; e.g. `FullSanitizer` and
 * `LinkSanitizer` ignore both `tags` and `attributes`.
 */
export interface SanitizeOptions {
  /** Tag allowlist override (consumed by `SafeListSanitizer`). */
  tags?: Iterable<string>;
  /** Attribute allowlist override (consumed by `SafeListSanitizer`). */
  attributes?: Iterable<string>;
  // scrubber? — added in PR 3
}

/**
 * @internal
 * Returns `true` if `html` is "trivial" — Rails' `ComposedSanitize` short-
 * circuits on `nil` and empty strings, returning them unchanged. The
 * caller is expected to return `html` directly when this is `true`.
 */
export function isTrivialInput(html: string | null | undefined): boolean {
  return html == null || html.length === 0;
}
