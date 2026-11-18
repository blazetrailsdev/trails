import { Base, DeserializationError } from "@blazetrails/activejob";
import { constSet } from "@blazetrails/ruby-compat";
import { Turbo } from "../../../../turbo-trails.js";
import { StreamsChannel } from "../../../channels/turbo/streams-channel.js";

export class BroadcastJob extends Base {
  static {
    this.discardOn(DeserializationError);
  }

  async perform(stream: unknown, rendering: Record<string, unknown> = {}): Promise<void> {
    await StreamsChannel.broadcastRenderTo(stream, rendering);
  }
}
constSet(Turbo.Streams, "BroadcastJob", BroadcastJob);
