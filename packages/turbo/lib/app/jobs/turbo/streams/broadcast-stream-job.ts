import { Base, DeserializationError } from "@blazetrails/activejob";
import { constSet } from "@blazetrails/ruby-compat";
import { Turbo } from "../../../../turbo-trails.js";
import { StreamsChannel } from "../../../channels/turbo/streams-channel.js";

export class BroadcastStreamJob extends Base {
  static {
    this.discardOn(DeserializationError);
  }

  async perform(stream: unknown, { content }: { content: unknown }): Promise<void> {
    await StreamsChannel.broadcastStreamTo(stream, { content });
  }
}
constSet(Turbo.Streams, "BroadcastStreamJob", BroadcastStreamJob);
