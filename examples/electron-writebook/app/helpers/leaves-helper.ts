import type { FormBuilder } from "@blazetrails/actionview";
import type { SafeBuffer } from "@blazetrails/activesupport";
import type { Leaf } from "../models/leaf.ts";
import type { Leafable } from "../models/leafable.ts";
import type { ViewHost } from "../../lib/trails-ext/view-host.ts";

export const LeavesHelper = {
  leafItemTag(
    this: ViewHost,
    leaf: Leaf,
    options: Record<string, unknown> = {},
    block?: () => unknown,
  ): SafeBuffer {
    return this.tag().li(
      {
        class: `arrangement__item toc__leaf toc__leaf--${(leaf as unknown as { leafableName: string }).leafableName}`,
        id: this.domId(leaf),
        data: { id: leaf.id, arrangementTarget: "item" },
        ...options,
      },
      block,
    );
  },

  leafNavTag(
    this: ViewHost,
    leaf: Leaf,
    options: Record<string, unknown> = {},
    block?: () => unknown,
  ): SafeBuffer {
    return this.tag().nav(
      {
        data: {
          controller: "reading-tracker",
          readingTrackerBookIdValue: leaf.book_id,
          readingTrackerLeafIdValue: leaf.id,
        },
        ...options,
      },
      block,
    );
  },

  leafableEditForm(
    this: ViewHost,
    leafable: Leafable,
    options: Record<string, unknown> = {},
    block?: (form: FormBuilder) => unknown,
  ) {
    return this.formWith(
      {
        model: leafable,
        url: (this.leafablePath as (l: Leaf) => string)(
          leafable.association("leaf").target as Leaf,
        ),
        method: "put",
        format: "html",
        data: {
          controller: "autosave",
          action:
            "autosave#submit:prevent input@document->autosave#change house-md:change->autosave#change",
          autosaveCleanClass: "clean",
          autosaveDirtyClass: "dirty",
          autosaveSavingClass: "saving",
        },
        ...options,
      },
      block,
    );
  },
};
