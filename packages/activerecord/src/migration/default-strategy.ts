/**
 * Default migration execution strategy.
 *
 * Mirrors: ActiveRecord::Migration::DefaultStrategy
 */

import { ExecutionStrategy } from "./execution-strategy.js";

export class DefaultStrategy extends ExecutionStrategy {
  async exec(method: string, args: unknown[]): Promise<unknown> {
    throw new Error(`DefaultStrategy#exec is not yet wired: ${method}`);
  }
}
