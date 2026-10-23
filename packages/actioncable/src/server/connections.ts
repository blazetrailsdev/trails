import { defineModule, rbModConstSet } from "@blazetrails/ruby-compat";
import { Server } from "../namespaces.js";

interface Connection {
  beat(): unknown;
  statistics: unknown;
}

interface ConnectionsHost {
  _connections?: Connection[];
  _heartbeatTimer?: unknown;
  connections: Connection[];
  eventLoop: {
    timer(interval: number, block: () => unknown): unknown;
    post(task: null, block: () => unknown): unknown;
  };
}

const BEAT_INTERVAL = 3;

export const Connections = defineModule({
  get connections(): Connection[] {
    return ((this as unknown as ConnectionsHost)._connections ??= []);
  },

  addConnection(this: ConnectionsHost, connection: Connection): Connection[] {
    this.connections.push(connection);
    return this.connections;
  },

  removeConnection(this: ConnectionsHost, connection: Connection): Connection | null {
    const connections = this.connections;
    let found: Connection | null = null;
    for (let i = connections.length - 1; i >= 0; i--) {
      if (connections[i] === connection) {
        found = connections[i];
        connections.splice(i, 1);
      }
    }
    return found;
  },

  setupHeartbeatTimer(this: ConnectionsHost): unknown {
    return (this._heartbeatTimer ??= this.eventLoop.timer(BEAT_INTERVAL, () =>
      this.eventLoop.post(null, () => this.connections.forEach((c) => c.beat())),
    ));
  },

  get openConnectionsStatistics(): unknown[] {
    return (this as unknown as ConnectionsHost).connections.map((c) => c.statistics);
  },
});
rbModConstSet(Connections, "BEAT_INTERVAL", BEAT_INTERVAL);

rbModConstSet(Server, "Connections", Connections);
