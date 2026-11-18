import { Base } from "@blazetrails/actioncable/channel/base";
import { extend, include } from "@blazetrails/ruby-compat";
import { Turbo } from "../../../turbo-trails.js";
import { Broadcasts } from "./streams/broadcasts.js";
import { StreamName } from "./streams/stream-name.js";

type BroadcastsMethods = typeof Broadcasts;

export class StreamsChannel extends Base {
  declare static verifiedStreamName: typeof StreamName.verifiedStreamName;
  declare static signedStreamName: typeof StreamName.signedStreamName;
  declare static streamNameFrom: typeof StreamName.streamNameFrom;
  declare static broadcastActionTo: OmitThisParameter<BroadcastsMethods["broadcastActionTo"]>;
  declare static broadcastRenderTo: OmitThisParameter<BroadcastsMethods["broadcastRenderTo"]>;
  declare static broadcastStreamTo: OmitThisParameter<BroadcastsMethods["broadcastStreamTo"]>;
  declare verifiedStreamNameFromParams: () => unknown;

  static {
    extend(this, Broadcasts);
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
