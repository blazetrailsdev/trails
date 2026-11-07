import { Sanitizer, type SanitizeOptions, isTrivialInput } from "./sanitizer.js";
import { safeListSanitize } from "./engine.js";
import { DEFAULT_ALLOWED_ATTRIBUTES, DEFAULT_ALLOWED_TAGS } from "./config.js";

export class SafeListSanitizer extends Sanitizer {
  static allowedTags: Set<string> = new Set(DEFAULT_ALLOWED_TAGS);

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
  if (typeof override === "string") {
    throw new TypeError(
      `SafeListSanitizer: \`${label}\` must be an iterable of strings, not a string`,
    );
  }
  return [...override];
}
