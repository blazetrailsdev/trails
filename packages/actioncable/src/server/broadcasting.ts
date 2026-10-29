import { ActiveSupportJSON, Notifications, truncate } from "@blazetrails/activesupport";
import { defineModule, rbInspect } from "@blazetrails/ruby-compat";

interface Coder {
  encode(message: unknown): unknown;
}

type PubSubLike = { broadcast(channel: string, payload: unknown): unknown };

interface BroadcastingServer {
  logger: { debug(progname: unknown, block: () => unknown): unknown };
  pubsub: PubSubLike;
}

interface CoderOptions {
  coder?: Coder | null;
}

export function broadcast(
  this: BroadcastingServer,
  broadcasting: unknown,
  message: unknown,
  options: CoderOptions = {},
): Promise<unknown> {
  return broadcasterFor.call(this, broadcasting, options).broadcast(message);
}

export function broadcasterFor(
  this: BroadcastingServer,
  broadcasting: unknown,
  options: CoderOptions = {},
): Broadcaster {
  const coder = Object.hasOwn(options, "coder") ? (options.coder ?? null) : ActiveSupportJSON;
  return new Broadcaster(this, String(broadcasting), { coder });
}

export const Broadcasting = defineModule({ broadcast, broadcasterFor });

/** @internal */
export class Broadcaster {
  readonly server: BroadcastingServer;
  readonly broadcasting: string;
  readonly coder: Coder | null;

  constructor(
    server: BroadcastingServer,
    broadcasting: string,
    { coder }: { coder: Coder | null },
  ) {
    this.server = server;
    this.broadcasting = broadcasting;
    this.coder = coder;
  }

  /** @missingRailsArgs truncate — PERMANENT */
  broadcast(message: unknown): Promise<unknown> {
    this.server.logger.debug(
      undefined,
      () =>
        `[ActionCable] Broadcasting to ${this.broadcasting}: ${truncate(rbInspect(message), 300)}`,
    );

    const payload = { broadcasting: this.broadcasting, message, coder: this.coder };
    return Notifications.instrument("broadcast.action_cable", payload, async () => {
      const encoded = this.coder != null ? this.coder.encode(message) : message;
      return await this.server.pubsub.broadcast(this.broadcasting, encoded);
    });
  }
}
