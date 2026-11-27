import type { SafeBuffer } from "@blazetrails/activesupport";
import type { Leaf } from "../../models/leaf.ts";
import type { ViewHost } from "../../../lib/trails-ext/view-host.ts";

export const EditingHelper = {
  async editingModeToggleSwitch(
    this: ViewHost,
    leaf: Leaf,
    { checked }: { checked: boolean },
  ): Promise<SafeBuffer> {
    const targetUrl = checked
      ? (this.leafableSlugPath as (l: Leaf) => string)(leaf)
      : (this.editLeafablePath as (l: Leaf) => string)(leaf);
    return await this.render("books/edit-mode", { targetUrl, checked });
  },
};
