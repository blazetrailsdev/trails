import { include } from "@blazetrails/activesupport";
import { StandardError, rbObjIvarSet } from "@blazetrails/ruby-compat";
import { underscore } from "@blazetrails/activesupport";
import { Identification } from "./connection/identification.js";
import { InternalChannel } from "./connection/internal-channel.js";

interface RemoteServer {
  broadcast(broadcasting: string, message: unknown): unknown;
  connectionIdentifiers: unknown;
}

export class InvalidIdentifiersError extends StandardError {}

export class RemoteConnection {
  static InvalidIdentifiersError = InvalidIdentifiersError;

  declare identifiers: Iterable<string>;
  /** @internal */
  declare protected readonly internalChannel: string;
  /** @internal */
  protected readonly server: RemoteServer;

  constructor(server: RemoteServer, ids: Record<string, unknown>) {
    this.server = server;
    this.setIdentifierInstanceVars(ids);
  }

  disconnect({ reconnect = true }: { reconnect?: unknown } = {}): unknown {
    return this.server.broadcast(this.internalChannel, { type: "disconnect", reconnect });
  }

  /** @internal */
  private setIdentifierInstanceVars(ids: Record<string, unknown>): void {
    if (!this.isValidIdentifiers(ids)) throw new InvalidIdentifiersError();
    for (const [k, v] of Object.entries(ids)) rbObjIvarSet(this, `@${underscore(k)}`, v);
  }

  /** @internal */
  private isValidIdentifiers(ids: Record<string, unknown>): boolean {
    const keys = Object.keys(ids);
    return [...this.identifiers].every((id) => keys.includes(id));
  }
}
include(RemoteConnection, InternalChannel);
include(RemoteConnection, Identification);
Object.defineProperty(RemoteConnection.prototype, "identifiers", {
  get(this: RemoteConnection) {
    return (this as unknown as { server: RemoteServer }).server.connectionIdentifiers;
  },
  configurable: true,
  enumerable: true,
});

export class RemoteConnections {
  static RemoteConnection = RemoteConnection;

  readonly server: RemoteServer;

  constructor(server: RemoteServer) {
    this.server = server;
  }

  where(identifier: Record<string, unknown>): RemoteConnection {
    return new RemoteConnection(this.server, identifier);
  }
}
