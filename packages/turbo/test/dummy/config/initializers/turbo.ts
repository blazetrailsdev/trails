import { onLoad } from "@blazetrails/activesupport";
import type { TagBuilder } from "../../../../lib/app/models/turbo/streams/tag-builder.js";

onLoad("turbo_streams_tag_builder", function (this: typeof TagBuilder) {
  Object.assign(this.prototype, {
    highlight(this: TagBuilder, target: unknown) {
      return this.action("highlight", target);
    },

    highlightAll(this: TagBuilder, targets: unknown) {
      return this.actionAll("highlight", targets);
    },
  });
});
