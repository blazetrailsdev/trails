import { isPresent, type SafeBuffer } from "@blazetrails/activesupport";
import type { Leaf } from "../models/leaf.ts";
import type { ViewHost } from "../../lib/trails-ext/view-host.ts";

export const SearchesHelper = {
  sanitizeSearchResult(this: ViewHost, html: unknown): SafeBuffer {
    return this.sanitize(html, { tags: ["mark"], attributes: [] });
  },

  async highlightSearchedContent(
    this: ViewHost,
    leaf: Leaf,
    content: unknown,
    query: unknown,
  ): Promise<unknown> {
    if (isPresent(query)) {
      const terms = wholeWordMatchers(await leaf.matchesForHighlight(query));

      return (this.sanitizeContent as (c: unknown) => SafeBuffer)(
        this.highlight(content, terms, { sanitize: false }),
      );
    } else {
      return content;
    }
  },
};

function wholeWordMatchers(terms: string[]): RegExp[] {
  return terms.map((term) => new RegExp(`\\b${RegExp.escape(term)}\\b`));
}
