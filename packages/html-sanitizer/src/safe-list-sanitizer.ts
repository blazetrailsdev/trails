// Rails parallel: lib/rails/html/sanitizer.rb -> class SafeListSanitizer.

import { Sanitizer, type SanitizeOptions, isTrivialInput } from "./sanitizer.js";
import { safeListSanitize } from "./engine.js";
import { DEFAULT_ALLOWED_ATTRIBUTES, DEFAULT_ALLOWED_TAGS } from "./config.js";

/**
 * Allowlist-based HTML sanitizer mirroring Rails'
 * `Rails::HTML::SafeListSanitizer`. Tags not in `allowedTags` are
 * stripped (their text content is preserved); attributes not in
 * `allowedAttributes` are dropped. URL-bearing attributes are filtered
 * to safe schemes.
 *
 * Per-instance options override class-level defaults; per-call options
 * (`tags` / `attributes` on `sanitize()`) override both.
 *
 * @example
 *   const s = new SafeListSanitizer();
 *   s.sanitize("<u>foo</u> with <i>bar</i>", { tags: ["u"] });
 *   // => "<u>foo</u> with bar"
 *
 *   new SafeListSanitizer({ prune: true })
 *     .sanitize("<u>leave me <b>now</b></u>", { tags: ["u"] });
 *   // => "<u>leave me </u>"
 *
 * Missing vs Rails: `sanitize_css(style_string)`. Loofah delegates to a
 * CSS-only sanitizer (Crass-backed); `sanitize-html` has no equivalent
 * standalone API. Deferred until we either ship a CSS sanitizer or swap
 * to an engine that supports it (revisit alongside PR 3).
 */
export class SafeListSanitizer extends Sanitizer {
  /**
   * Class-level default allowed tags. Mutable so apps can configure
   * once at boot (mirrors `Rails::HTML4::SafeListSanitizer.allowed_tags = ...`).
   */
  static allowedTags: Set<string> = new Set(DEFAULT_ALLOWED_TAGS);

  /** Class-level default allowed attributes. */
  static allowedAttributes: Set<string> = new Set(DEFAULT_ALLOWED_ATTRIBUTES);

  private readonly prune: boolean;

  constructor(options: { prune?: boolean } = {}) {
    super();
    this.prune = options.prune ?? false;
  }

  sanitize(
    html: string | null | undefined,
    options: SanitizeOptions = {},
  ): string | null | undefined {
    if (isTrivialInput(html)) return html;

    const tags = resolveAllowlist(
      options.tags,
      (this.constructor as typeof SafeListSanitizer).allowedTags,
      "tags",
    );
    const attributes = resolveAllowlist(
      options.attributes,
      (this.constructor as typeof SafeListSanitizer).allowedAttributes,
      "attributes",
    );

    return safeListSanitize(html as string, {
      allowedTags: tags,
      allowedAttributes: attributes,
      prune: this.prune,
    });
  }
}

function resolveAllowlist(
  override: Iterable<string> | undefined,
  fallback: Set<string>,
  label: "tags" | "attributes",
): string[] {
  if (override === undefined) return [...fallback];
  // Rails raises ArgumentError when tags/attributes is not Enumerable.
  // Strings are iterable in JS (char-by-char), which is never what the
  // caller meant — guard explicitly.
  if (typeof override === "string") {
    throw new TypeError(
      `SafeListSanitizer: \`${label}\` must be an iterable of strings, not a string`,
    );
  }
  return [...override];
}
