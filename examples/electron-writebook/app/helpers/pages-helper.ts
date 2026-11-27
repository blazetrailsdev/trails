import { isBlank, toSentence, type SafeBuffer } from "@blazetrails/activesupport";
import { HtmlScrubber } from "../models/html-scrubber.ts";
import type { Book } from "../models/book.ts";
import type { Leaf } from "../models/leaf.ts";
import type { ViewHost } from "../../lib/trails-ext/view-host.ts";

export const PagesHelper = {
  wordCount(this: ViewHost, content: string | null | undefined): string | undefined {
    if (isBlank(content)) return;
    return this.pluralize(
      this.numberWithDelimiter(content!.split(/\s+/).filter((w) => w !== "").length),
      "word",
    );
  },

  pageTitle(this: ViewHost, leaf: Leaf, book: Book): string {
    return String(
      toSentence(
        [leaf.title, book.title, book.author].filter((part) => !isBlank(part)),
        { twoWordsConnector: " · ", wordsConnector: " · ", lastWordConnector: " · " },
      ),
    );
  },

  sanitizeContent(this: ViewHost, content: unknown): SafeBuffer {
    return this.sanitize(content, { scrubber: new HtmlScrubber() });
  },
};
