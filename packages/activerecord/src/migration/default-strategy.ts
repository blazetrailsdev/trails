/**
 * The default strategy for executing migrations. Delegates method calls
 * to the connection adapter.
 *
 * Mirrors: ActiveRecord::Migration::DefaultStrategy
 */

import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { ExecutionStrategy } from "./execution-strategy.js";

export class DefaultStrategy extends ExecutionStrategy {
  /** @internal */
  methodMissing(method: string, ...args: unknown[]): unknown {
    const conn = this.connection as unknown as Record<string, unknown>;
    return (conn[method] as (...a: unknown[]) => unknown).apply(conn, args);
  }

  /** @internal */
  respondToMissing(method: string): boolean {
    const conn = this.connection as unknown as Record<string, unknown>;
    return typeof conn[method] === "function";
  }

  protected get connection(): DatabaseAdapter {
    return this.migration.connection;
  }
}
