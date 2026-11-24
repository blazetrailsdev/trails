import type { SafeBuffer } from "@blazetrails/activesupport";
import type { Book } from "../models/book.ts";
import type { ViewHost } from "../../lib/trails-ext/view-host.ts";

export const ArrangementHelper = {
  arrangementTag(
    this: ViewHost,
    book: Book,
    options: Record<string, unknown> = {},
    block?: () => unknown,
  ): SafeBuffer {
    return this.tag().div(
      {
        data: {
          controller: "arrangement reading-progress",
          arrangementCursorClass: "arrangement-cursor",
          arrangementSelectedClass: "arrangement-selected",
          arrangementPlaceholderClass: "arrangement-placeholder",
          arrangementAddingModeClass: "arrangement--adding",
          arrangementMoveModeClass: "arrangement-move-mode",
          arrangementUrlValue: (this.bookLeavesMovesUrl as (b: Book) => string)(book),
          readingProgressBookIdValue: book.id,
          readingProgressLastReadClass: "toc__leaf--last-read",
        },
        ...options,
      },
      block,
    );
  },

  arrangementActions(this: ViewHost): string {
    const actions: Record<string, string> = {
      click: "click",
      dragstart: "dragStart",
      dragover: "dragOver:prevent",
      dragend: "dragEnd",
      drop: "drop",
      "keydown.up": "moveBefore",
      "keydown.right": "moveAfter",
      "keydown.down": "moveAfter",
      "keydown.left": "moveBefore",
      "keydown.shift+up": "moveBefore",
      "keydown.shift+right": "moveAfter",
      "keydown.shift+down": "moveAfter",
      "keydown.shift+left": "moveBefore",
      "keydown.space": "toggleMoveMode",
      "keydown.enter": "applyMoveMode",
      "keydown.esc": "cancelMoveMode",
    };

    return Object.entries(actions)
      .map(([action, target]) => `${action}->arrangement#${target}`)
      .join(" ");
  },
};
