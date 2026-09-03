import sanitizeHtml from "sanitize-html";

/** @internal */
const PRESERVED_TAGS: readonly string[] = [
  ...sanitizeHtml.defaults.allowedTags,
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

/** @internal */
export function stripAllTags(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  });
}

/** @internal */
export interface SafeListEngineOptions {
  allowedTags: readonly string[];
  allowedAttributes: readonly string[];
  prune?: boolean;
}

/** @internal */
export function safeListSanitize(html: string, options: SafeListEngineOptions): string {
  const allowedAttrs = [...options.allowedAttributes];

  return sanitizeHtml(html, {
    allowedTags: [...options.allowedTags],
    allowedAttributes: { "*": allowedAttrs },
    disallowedTagsMode: options.prune ? "completelyDiscard" : "discard",
  });
}

/** @internal */
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
