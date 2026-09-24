import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { ExecutionStrategy } from "./execution-strategy.js";

export class DefaultStrategy extends ExecutionStrategy {
  async methodMissing(method: string, ...args: unknown[]): Promise<unknown> {
    const conn = (await this.connection) as unknown as Record<string, unknown>;
    return (conn[method] as (...a: unknown[]) => unknown).apply(conn, args);
  }

  async respondToMissing(method: string): Promise<boolean> {
    const conn = (await this.connection) as unknown as Record<string, unknown>;
    return typeof conn[method] === "function";
  }

  protected get connection(): DatabaseAdapter | Promise<DatabaseAdapter> {
    return this.migration.connection;
  }
}
