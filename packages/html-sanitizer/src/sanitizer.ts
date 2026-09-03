export abstract class Sanitizer {
  abstract sanitize(
    html: string | null | undefined,
    options?: SanitizeOptions,
  ): string | null | undefined;
}

export interface SanitizeOptions {
  tags?: Iterable<string>;
  attributes?: Iterable<string>;
}

/** @internal */
export function isTrivialInput(html: string | null | undefined): boolean {
  return html == null || html.length === 0;
}
