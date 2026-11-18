import "../../../../constants.action-broadcast-job.generated.js";
import { Base, DeserializationError } from "@blazetrails/activejob";
import { Turbo } from "../../../../turbo-trails.js";
import { StreamsChannel } from "../../../channels/turbo/streams-channel.js";

export class ActionBroadcastJob extends Base {
  static {
    this.discardOn(DeserializationError);
  }

  async perform(
    stream: unknown,
    { action, target, attributes = {}, ...rendering }: Record<string, unknown>,
  ): Promise<void> {
    await StreamsChannel.broadcastActionTo(stream, { action, target, attributes, ...rendering });
  }
}
Turbo.Streams.ActionBroadcastJob = ActionBroadcastJob;
