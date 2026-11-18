import { Turbo } from "../../../../turbo-trails.js";
import { TagBuilder } from "../../../models/turbo/streams/tag-builder.js";

export const TurboStreamsTagBuilder = {
  /** @internal */
  get turboStream(): TagBuilder {
    return new TagBuilder((this as unknown as { viewContext(): object }).viewContext());
  },
};
Turbo.Streams.TurboStreamsTagBuilder = TurboStreamsTagBuilder;
