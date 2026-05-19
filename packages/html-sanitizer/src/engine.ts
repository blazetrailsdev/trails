// Internal seam over sanitize-html. The rest of the package never imports
// sanitize-html directly; swapping the engine is a one-file change.

import sanitizeHtml from "sanitize-html";

/**
 * @internal
 * Tags preserved by `unwrapTagsAndStripAttributes` (i.e. the universe
 * LinkSanitizer is allowed to keep). sanitize-html has no native "deny
 * list" mode, so we compose this from its built-in defaults plus the
 * media/embedded tags Rails users commonly include in body content but
 * the upstream library omits. The unwrap targets passed by the caller
 * are subtracted from this set.
 *
 * Divergence from Loofah's `TargetScrubber`: Loofah preserves arbitrary
 * tags by default, we restrict to this enumerated set. Safer default for
 * a web framework; document for users.
 */
const PRESERVED_TAGS: readonly string[] = [
  ...sanitizeHtml.defaults.allowedTags,
  // Multimedia / embedded content not in sanitize-html's defaults.
  "img",
  "picture",
  "source",
  "video",
  "audio",
  "track",
  "details",
  "summary",
  "figure",
  "figcaption",
];

/**
 * @internal
 * Strip every tag, leaving text content only. Mirrors Loofah's
 * TextOnlyScrubber used by Rails' FullSanitizer.
 */
export function stripAllTags(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  });
}

/**
 * @internal
 * Options consumed by `safeListSanitize`. Mirrors the Rails
 * `SafeListSanitizer` scrub options: allowed tags + attributes plus a
 * `prune` switch that swaps the default "strip tag, keep content"
 * behavior for "remove tag and its children".
 */
export interface SafeListEngineOptions {
  allowedTags: readonly string[];
  allowedAttributes: readonly string[];
  prune?: boolean;
}

/**
 * @internal
 * Allowlist sanitize for SafeListSanitizer. Drops any tag not in
 * `allowedTags` (keeping inner text by default, or pruning children when
 * `prune` is true) and strips any attribute not in `allowedAttributes`.
 * URL-bearing attributes are filtered to safe schemes by the engine.
 */
export function safeListSanitize(html: string, options: SafeListEngineOptions): string {
  const allowedAttrs = [...options.allowedAttributes];

  return sanitizeHtml(html, {
    allowedTags: [...options.allowedTags],
    // Apply the same allowlist to every tag — Rails' PermitScrubber
    // doesn't gate attributes per-tag, it's one flat list.
    allowedAttributes: { "*": allowedAttrs },
    // Rails' `prune: true` → remove disallowed tags AND their content.
    // Default behavior strips the tag but keeps inner text.
    disallowedTagsMode: options.prune ? "completelyDiscard" : "discard",
    // sanitize-html's default allowedSchemes (http/https/ftp/mailto/tel)
    // matches Loofah's safe-URL set for href/src; javascript: and
    // vbscript: are dropped automatically.
  });
}

/**
 * @internal
 * "Unwrap" the listed tags: drop the open/close markers but keep the
 * inner text, and strip the listed attributes from any element that
 * survives. Mirrors Loofah's TargetScrubber used by Rails' LinkSanitizer
 * (tags: ['a'], attributes: ['href']).
 */
export function unwrapTagsAndStripAttributes(
  html: string,
  tagsToUnwrap: readonly string[],
  attributesToStrip: readonly string[],
): string {
  const unwrap = new Set(tagsToUnwrap.map((t) => t.toLowerCase()));
  const stripAttrs = new Set(attributesToStrip.map((a) => a.toLowerCase()));

  const allowedTags = PRESERVED_TAGS.filter((t) => !unwrap.has(t.toLowerCase()));

  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: false,
    transformTags:
      stripAttrs.size === 0
        ? undefined
        : {
            "*": (tagName, attribs) => {
              const filtered: Record<string, string> = {};
              for (const [k, v] of Object.entries(attribs)) {
                if (!stripAttrs.has(k.toLowerCase())) filtered[k] = v;
              }
              return { tagName, attribs: filtered };
            },
          },
  });
}
