import { ActiveSupportJSON, Notifications, truncate } from "@blazetrails/activesupport";
import { defineModule, rbInspect, rbModConstSet } from "@blazetrails/ruby-compat";
import { Server } from "../namespaces.js";

interface Coder {
  encode(message: unknown): unknown;
}

interface BroadcastingServer {
  logger: { debug(progname: unknown, block: () => unknown): unknown };
  pubsub: { broadcast(channel: string, payload: unknown): unknown };
}

interface CoderOptions {
  coder?: Coder | null;
}

export const Broadcasting = defineModule({
  broadcast(
    this: BroadcastingServer & { broadcasterFor: typeof broadcasterFor },
    broadcasting: unknown,
    message: unknown,
    options: CoderOptions = {},
  ): Promise<unknown> {
    return this.broadcasterFor(broadcasting, options).broadcast(message);
  },

  broadcasterFor,
});

function broadcasterFor(
  this: BroadcastingServer,
  broadcasting: unknown,
  options: CoderOptions = {},
): Broadcaster {
  const coder = Object.hasOwn(options, "coder") ? (options.coder ?? null) : ActiveSupportJSON;
  return new Broadcaster(this, String(broadcasting), { coder });
}

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

rbModConstSet(Broadcasting, "Broadcaster", Broadcaster);
rbModConstSet(Server, "Broadcasting", Broadcasting);
