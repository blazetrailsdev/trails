import { ActiveSupportJSON, Logger, TaggedLogging } from "@blazetrails/activesupport";
import { StringIO } from "@blazetrails/ruby-compat";
import { SuccessAdapter } from "./test-adapter.js";
import { TestServer, type AdapterClass } from "./test-server.js";
import { User } from "./user.js";

interface Coder {
  encode(message: unknown): unknown;
  decode(message: unknown): unknown;
}

export class TestConnection {
  readonly identifiers: string[];
  readonly logger: ReturnType<typeof TaggedLogging.new<Logger>>;
  readonly currentUser: User;
  readonly server: TestServer;
  declare readonly subscriptions: unknown;
  readonly transmissions: unknown[];
  private _coder: Coder;

  get pubsub(): unknown {
    return this.server.pubsub;
  }

  get config(): TestServer["config"] {
    return this.server.config;
  }

  constructor(
    user = new User("lifo"),
    {
      coder = ActiveSupportJSON as Coder,
      subscriptionAdapter = SuccessAdapter as AdapterClass,
    } = {},
  ) {
    this._coder = coder;
    this.identifiers = ["currentUser"];

    this.currentUser = user;
    this.logger = TaggedLogging.new(new Logger(new StringIO()));
    this.server = new TestServer({ subscriptionAdapter });
    this.transmissions = [];
  }

  transmit(cableMessage: unknown): unknown[] {
    this.transmissions.push(this.encode(cableMessage));
    return this.transmissions;
  }

  get lastTransmission(): unknown {
    return this.transmissions.length > 0 ? this.decode(this.transmissions.at(-1)) : null;
  }

  decode(websocketMessage: unknown): unknown {
    return this._coder.decode(websocketMessage);
  }

  encode(cableMessage: unknown): unknown {
    return this._coder.encode(cableMessage);
  }
}
