import "../../../../constants.broadcast-stream-job.generated.js";
import { Base, DeserializationError } from "@blazetrails/activejob";
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
Turbo.Streams.BroadcastStreamJob = BroadcastStreamJob;
