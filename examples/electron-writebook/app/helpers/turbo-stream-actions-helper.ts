import { prepend, type SafeBuffer } from "@blazetrails/activesupport";
import { TagBuilder } from "@blazetrails/turbo/app/models/turbo/streams/tag-builder.js";

export const TurboStreamActionsHelper = {
  scrollIntoView(
    this: { turboStreamActionTag(action: string, options: Record<string, unknown>): SafeBuffer },
    id: unknown,
    { animation = null }: { animation?: string | null } = {},
  ): SafeBuffer {
    return this.turboStreamActionTag("scroll_into_view", { target: id, animation });
  },
};

prepend(TagBuilder, TurboStreamActionsHelper);

declare module "@blazetrails/turbo/app/models/turbo/streams/tag-builder.js" {
  interface TagBuilder {
    scrollIntoView: (typeof TurboStreamActionsHelper)["scrollIntoView"];
  }
}
