import { Base } from "@blazetrails/actioncable/channel/base";
import { extend, include } from "@blazetrails/ruby-compat";
import { Turbo } from "../../../turbo-trails.js";
import { StreamName } from "./streams/stream-name.js";

export class StreamsChannel extends Base {
  declare static verifiedStreamName: typeof StreamName.verifiedStreamName;
  declare static signedStreamName: typeof StreamName.signedStreamName;
  declare static streamNameFrom: typeof StreamName.streamNameFrom;
  declare verifiedStreamNameFromParams: () => unknown;

  static {
    extend(this, StreamName);
    include(this, StreamName.ClassMethods);
  }

  protected override subscribed(): unknown {
    const streamName = this.verifiedStreamNameFromParams();
    if (streamName != null && streamName !== false) {
      return this.streamFrom(streamName as string);
    } else {
      return this.reject();
    }
  }
}
Turbo.StreamsChannel = StreamsChannel;
