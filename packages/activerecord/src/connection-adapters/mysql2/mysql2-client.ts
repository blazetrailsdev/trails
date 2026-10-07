import type mysql from "mysql2/promise";

export interface Mysql2Client extends mysql.Connection {
  automaticClose: boolean;
}

const AUTOMATIC_CLOSE = new WeakMap<object, boolean>();

const automaticClose: PropertyDescriptor = {
  configurable: true,
  get(this: object): boolean {
    return AUTOMATIC_CLOSE.get(this) ?? true;
  },
  set(
    this: { connection?: { stream?: { removeAllListeners?(): unknown; unref?(): unknown } } },
    value: boolean,
  ) {
    AUTOMATIC_CLOSE.set(this, value);
    if (value) return;
    const stream = this.connection?.stream;
    stream?.removeAllListeners?.();
    stream?.unref?.();
  },
};

/** @noRailsEquivalent CONVERGEABLE mysql2-perform-query-takes-rails-control-flow-over-a-gem-shaped-raw-connection */
export function mysql2Client<T extends object>(client: T): T & Mysql2Client {
  return Object.defineProperty(client, "automaticClose", automaticClose) as T & Mysql2Client;
}
