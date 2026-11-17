import {
  ArgumentError,
  extractOptionsBang,
  isPresent,
  type SafeBuffer,
} from "@blazetrails/activesupport";
import { rbObjAsString } from "@blazetrails/ruby-compat";
import { Turbo } from "../../../turbo-trails.js";
import { StreamsChannel } from "../../channels/turbo/streams-channel.js";

type Options = Record<string, unknown>;

interface StreamsHelperHost {
  tag(): { turbo_cable_stream_source(options: Options): SafeBuffer };
}

export const StreamsHelper = {
  turboStreamFrom(this: StreamsHelperHost, ...streamables: unknown[]): SafeBuffer {
    const attributes = extractOptionsBang(streamables) as Options;
    if (!streamables.some((streamable) => isPresent(streamable)))
      throw new ArgumentError("streamables can't be blank");
    attributes["channel"] =
      attributes["channel"] == null
        ? "Turbo::StreamsChannel"
        : rbObjAsString(attributes["channel"]);
    attributes["signed-stream-name"] = StreamsChannel.signedStreamName(streamables);

    return this.tag().turbo_cable_stream_source(attributes);
  },
};
Turbo.StreamsHelper = StreamsHelper;
