import { extend, hashAref, include, TopLevel } from "@blazetrails/ruby-compat";
import { Broadcasts } from "../../../../lib/app/channels/turbo/streams/broadcasts.js";
import { StreamName } from "../../../../lib/app/channels/turbo/streams/stream-name.js";
import { ApplicationCable } from "./application-cable/channel.js";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    SectionChannel?: typeof SectionChannel;
  }
}

export class SectionChannel extends ApplicationCable.Channel {
  declare static verifiedStreamName: typeof StreamName.verifiedStreamName;
  declare verifiedStreamNameFromParams: () => unknown;

  static {
    extend(this, Broadcasts, StreamName);
    include(this, StreamName.ClassMethods);
  }

  protected override subscribed(): unknown {
    const streamName = [hashAref(this.params, "section"), this.verifiedStreamNameFromParams()].join(
      "_",
    );
    return this.streamFrom(streamName);
  }
}
TopLevel.SectionChannel = SectionChannel;
