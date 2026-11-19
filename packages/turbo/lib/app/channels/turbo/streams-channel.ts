import "../../../constants.streams-channel.generated.js";
import { Base } from "@blazetrails/actioncable/channel/base";
import { extend, include } from "@blazetrails/ruby-compat";
import { Turbo } from "../../../turbo-trails.js";
import { Broadcasts } from "./streams/broadcasts.js";
import { StreamName } from "./streams/stream-name.js";

type Bc<K extends keyof typeof Broadcasts> = OmitThisParameter<(typeof Broadcasts)[K]>;

export class StreamsChannel extends Base {
  declare static verifiedStreamName: typeof StreamName.verifiedStreamName;
  declare static signedStreamName: typeof StreamName.signedStreamName;
  declare static streamNameFrom: typeof StreamName.streamNameFrom;
  declare static broadcastActionTo: Bc<"broadcastActionTo">;
  declare static broadcastRenderTo: Bc<"broadcastRenderTo">;
  declare static broadcastStreamTo: Bc<"broadcastStreamTo">;
  declare static broadcastRemoveTo: Bc<"broadcastRemoveTo">;
  declare static broadcastReplaceTo: Bc<"broadcastReplaceTo">;
  declare static broadcastUpdateTo: Bc<"broadcastUpdateTo">;
  declare static broadcastBeforeTo: Bc<"broadcastBeforeTo">;
  declare static broadcastAfterTo: Bc<"broadcastAfterTo">;
  declare static broadcastAppendTo: Bc<"broadcastAppendTo">;
  declare static broadcastPrependTo: Bc<"broadcastPrependTo">;
  declare static broadcastRefreshTo: Bc<"broadcastRefreshTo">;
  declare static broadcastReplaceLaterTo: Bc<"broadcastReplaceLaterTo">;
  declare static broadcastUpdateLaterTo: Bc<"broadcastUpdateLaterTo">;
  declare static broadcastAppendLaterTo: Bc<"broadcastAppendLaterTo">;
  declare static broadcastPrependLaterTo: Bc<"broadcastPrependLaterTo">;
  declare static broadcastRefreshLaterTo: Bc<"broadcastRefreshLaterTo">;
  declare static broadcastActionLaterTo: Bc<"broadcastActionLaterTo">;
  declare static broadcastRenderLaterTo: Bc<"broadcastRenderLaterTo">;
  declare static refreshDebouncerFor: Bc<"refreshDebouncerFor">;
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
