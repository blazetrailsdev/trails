import { registerModel, type Relation } from "@blazetrails/activerecord";
import { Time } from "@blazetrails/date";
import { Digest, Range, unpack1 } from "@blazetrails/ruby-compat";
import { Record } from "./record.js";
import { SolidCable } from "./solid-cable.js";

export class Message extends Record {
  declare static trimmable: () => Relation<Message>;
  declare static broadcastable: (channels: Iterable<string>, lastId: number) => Relation<Message>;
  declare id: number;
  declare channel: Uint8Array;
  declare payload: Uint8Array;
  declare created_at: Time;
  declare channel_hash: number | bigint;

  static {
    registerModel("SolidCable::Message", this);

    this.scope("trimmable", function () {
      return this.where({ created_at: new Range(null, SolidCable.messageRetention().ago(), true) });
    });
    this.scope("broadcastable", function (channels: Iterable<string>, lastId: number) {
      return this.where({ channel_hash: Message.channelHashesFor(channels) })
        .where({ id: new Range(lastId + 1, null) })
        .order("id");
    });
  }

  static async broadcast(channel: string, payload: unknown): Promise<unknown> {
    return await this.insert({
      created_at: Time.current(),
      channel,
      payload,
      channel_hash: this.channelHashFor(channel),
    });
  }

  static channelHashesFor(channels: Iterable<string>): (number | bigint)[] {
    return [...channels].map((channel) => this.channelHashFor(channel));
  }

  /** @missingRailsArgs unpack1 — PERMANENT */
  static channelHashFor(channel: unknown): number | bigint {
    return unpack1(Digest.SHA256.digest(String(channel)), "q>")!;
  }
}

declare module "@blazetrails/activerecord" {
  // eslint-disable-next-line unused-imports/no-unused-vars
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    trimmable(this: Relation<Message>): Relation<Message>;
  }
}
