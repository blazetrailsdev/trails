import type { SafeBuffer } from "@blazetrails/activesupport";
import { safeJoin } from "@blazetrails/actionview";
import type { Book } from "../models/book.ts";
import type { Leaf } from "../models/leaf.ts";
import type { ViewHost } from "../../lib/trails-ext/view-host.ts";

type PathFor = (record: unknown, options?: Record<string, unknown>) => string;

export const BooksHelper = {
  bookTocTag(this: ViewHost, book: Book, block?: () => unknown): SafeBuffer {
    return this.tag().ol(
      {
        class: "toc",
        tabindex: 0,
        data: {
          controller: "arrangement",
          action: (this.arrangementActions as () => string)(),
          arrangementCursorClass: "arrangement-cursor",
          arrangementSelectedClass: "arrangement-selected",
          arrangementPlaceholderClass: "arrangement-placeholder",
          arrangementMoveModeClass: "arrangement-move-mode",
          arrangementUrlValue: (this.bookLeavesMovesUrl as PathFor)(book),
        },
      },
      block,
    );
  },

  async bookPartCreateButton(
    this: ViewHost,
    book: Book,
    kind: new () => unknown,
    options: Record<string, unknown> = {},
    block?: () => unknown,
  ): Promise<SafeBuffer> {
    const url = this.urlFor([book, new kind()]);

    return await this.buttonTo(
      url,
      {
        class:
          "btn btn--plain txt-medium fill-transparent disable-when-arranging disable-when-deleting",
        draggable: true,
        data: {
          action: "dragstart->arrangement#dragStartCreate dragend->arrangement#dragEndCreate",
          arrangementUrlParam: url,
        },
        ...options,
      },
      null,
      block,
    );
  },

  linkToFirstLeafable(this: ViewHost, leaves: Leaf[]): SafeBuffer | undefined {
    const firstLeaf = leaves[0];
    if (firstLeaf) {
      return this.linkTo(
        (this.leafableSlugPath as PathFor)(firstLeaf),
        { data: hotkeyDataAttributes("right"), class: "disable-when-arranging", hidden: true },
        null,
        () =>
          safeJoin([
            this.tag().span({ class: "btn" }, () =>
              safeJoin([
                this.imageTag("arrow-right.svg", { aria: { hidden: true }, size: 24 }),
                this.tag().span("Start reading", { class: "for-screen-reader" }),
              ]),
            ),
            this.tag().span(firstLeaf.title, { class: "overflow-ellipsis" }),
          ]),
      );
    }
  },

  async linkToPreviousLeafable(
    this: ViewHost,
    leaf: Leaf,
    { hotkey = true, forEdit = false }: { hotkey?: boolean; forEdit?: boolean } = {},
  ): Promise<SafeBuffer> {
    const previousLeaf = (await leaf.previous()) as Leaf | null;
    const book = leaf.association("book").target as Book;
    if (previousLeaf) {
      previousLeaf.association("book").target = book;
      const path = forEdit
        ? (this.editLeafablePath as PathFor)(previousLeaf)
        : (this.leafableSlugPath as PathFor)(previousLeaf);
      return this.linkTo(
        path,
        { data: hotkeyDataAttributes("left", { enabled: hotkey }), class: "btn" },
        null,
        () =>
          safeJoin([
            this.imageTag("arrow-left.svg", { aria: { hidden: true }, size: 24 }),
            this.tag().span(`Previous: ${previousLeaf.title}`, { class: "for-screen-reader" }),
          ]),
      );
    } else {
      return this.linkTo(
        (this.bookSlugPath as PathFor)(book),
        { data: hotkeyDataAttributes("left", { enabled: hotkey }), class: "btn" },
        null,
        () =>
          safeJoin([
            this.imageTag("arrow-left.svg", { aria: { hidden: true }, size: 24 }),
            this.tag().span(`Table of contents: ${book.title}`, { class: "for-screen-reader" }),
          ]),
      );
    }
  },

  async linkToNextLeafable(
    this: ViewHost,
    leaf: Leaf,
    { hotkey = true, forEdit = false }: { hotkey?: boolean; forEdit?: boolean } = {},
  ): Promise<SafeBuffer> {
    const nextLeaf = (await leaf.next()) as Leaf | null;
    const book = leaf.association("book").target as Book;
    if (nextLeaf) {
      nextLeaf.association("book").target = book;
      const path = forEdit
        ? (this.editLeafablePath as PathFor)(nextLeaf)
        : (this.leafableSlugPath as PathFor)(nextLeaf);
      return this.linkTo(
        path,
        {
          data: hotkeyDataAttributes("right", { enabled: hotkey }),
          class: "btn txt-medium min-width",
        },
        null,
        () =>
          safeJoin([
            this.tag().span(`Next: ${nextLeaf.title}`, { class: "overflow-ellipsis" }),
            this.imageTag("arrow-right.svg", { aria: { hidden: true }, size: 24 }),
          ]),
      );
    } else {
      return this.linkTo(
        (this.bookSlugPath as PathFor)(book),
        { data: hotkeyDataAttributes("right", { enabled: hotkey }), class: "btn txt-medium" },
        null,
        () =>
          safeJoin([
            this.tag().span(`Table of contents: ${book.title}`, { class: "overflow-ellipsis" }),
            this.imageTag("arrow-reverse.svg", { aria: { hidden: true }, size: 24 }),
          ]),
      );
    }
  },
};

function hotkeyDataAttributes(key: string, { enabled = true }: { enabled?: boolean } = {}) {
  if (enabled) {
    return {
      controller: "hotkey",
      action: `keydown.${key}@document->hotkey#click touch:swipe-${key}@window->hotkey#click`,
    };
  }
}
