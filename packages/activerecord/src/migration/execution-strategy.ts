/**
 * Migration execution strategy interface.
 *
 * Mirrors: ActiveRecord::Migration::ExecutionStrategy
 */

export abstract class ExecutionStrategy {
  abstract exec(method: string, args: unknown[]): Promise<unknown>;
}
