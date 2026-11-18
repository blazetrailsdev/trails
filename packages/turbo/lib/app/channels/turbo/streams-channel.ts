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
  declare static broadcastRemoveTo: OmitThisParameter<BroadcastsMethods["broadcastRemoveTo"]>;
  declare static broadcastReplaceTo: OmitThisParameter<BroadcastsMethods["broadcastReplaceTo"]>;
  declare static broadcastUpdateTo: OmitThisParameter<BroadcastsMethods["broadcastUpdateTo"]>;
  declare static broadcastBeforeTo: OmitThisParameter<BroadcastsMethods["broadcastBeforeTo"]>;
  declare static broadcastAfterTo: OmitThisParameter<BroadcastsMethods["broadcastAfterTo"]>;
  declare static broadcastAppendTo: OmitThisParameter<BroadcastsMethods["broadcastAppendTo"]>;
  declare static broadcastPrependTo: OmitThisParameter<BroadcastsMethods["broadcastPrependTo"]>;
  declare static broadcastRefreshTo: OmitThisParameter<BroadcastsMethods["broadcastRefreshTo"]>;
  declare static broadcastActionTo: OmitThisParameter<BroadcastsMethods["broadcastActionTo"]>;
  declare static broadcastReplaceLaterTo: OmitThisParameter<
    BroadcastsMethods["broadcastReplaceLaterTo"]
  >;
  declare static broadcastUpdateLaterTo: OmitThisParameter<
    BroadcastsMethods["broadcastUpdateLaterTo"]
  >;
  declare static broadcastBeforeLaterTo: OmitThisParameter<
    BroadcastsMethods["broadcastBeforeLaterTo"]
  >;
  declare static broadcastAfterLaterTo: OmitThisParameter<
    BroadcastsMethods["broadcastAfterLaterTo"]
  >;
  declare static broadcastAppendLaterTo: OmitThisParameter<
    BroadcastsMethods["broadcastAppendLaterTo"]
  >;
  declare static broadcastPrependLaterTo: OmitThisParameter<
    BroadcastsMethods["broadcastPrependLaterTo"]
  >;
  declare static broadcastRefreshLaterTo: OmitThisParameter<
    BroadcastsMethods["broadcastRefreshLaterTo"]
  >;
  declare static broadcastActionLaterTo: OmitThisParameter<
    BroadcastsMethods["broadcastActionLaterTo"]
  >;
  declare static broadcastRenderTo: OmitThisParameter<BroadcastsMethods["broadcastRenderTo"]>;
  declare static broadcastRenderLaterTo: OmitThisParameter<
    BroadcastsMethods["broadcastRenderLaterTo"]
  >;
  declare static broadcastStreamTo: OmitThisParameter<BroadcastsMethods["broadcastStreamTo"]>;
  declare static refreshDebouncerFor: OmitThisParameter<BroadcastsMethods["refreshDebouncerFor"]>;
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
