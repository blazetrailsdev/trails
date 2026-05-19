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
