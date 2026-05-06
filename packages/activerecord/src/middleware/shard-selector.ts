/**
 * Mirrors: ActiveRecord::Middleware::ShardSelector
 *
 * Middleware for automatic shard selection based on request context.
 */

import { Base } from "../base.js";
import { Notifications } from "@blazetrails/activesupport";

export interface ShardRequest {
  method: string;
  [key: string]: unknown;
}

type ShardResolverFn = (request: ShardRequest) => string | symbol;

type NextHandler = () => Promise<unknown>;

export class ShardSelector {
  /** @internal */
  readonly resolver: ShardResolverFn;
  /** @internal */
  readonly options: { lock?: boolean };

  private readonly app: (next: NextHandler) => Promise<unknown>;

  constructor(
    app: (next: NextHandler) => Promise<unknown>,
    resolver: ShardResolverFn,
    options: { lock?: boolean } = {},
  ) {
    this.app = app;
    this.resolver = resolver;
    this.options = options;
  }

  async call(request: ShardRequest): Promise<unknown> {
    const shard = this.selectShard(request);
    return this.setShard(shard, () => this.app(() => Promise.resolve()));
  }

  /** @internal */
  instrumenter(): typeof Notifications {
    return Notifications;
  }

  /** @internal */
  shardResolver(): ShardResolverFn {
    return this.resolver;
  }

  /** @internal */
  shardSelectorStrategy(): { lock: boolean } {
    return { lock: this.options.lock ?? true };
  }

  /** @internal */
  selectedShard(request: ShardRequest): string | symbol {
    return this.resolver(request);
  }

  private selectShard(request: ShardRequest): string | symbol {
    return this.selectedShard(request);
  }

  private async setShard<T>(shard: string | symbol, block: () => T | Promise<T>): Promise<T> {
    const shardKey =
      typeof shard === "string" ? shard : (Symbol.keyFor(shard) ?? shard.description ?? "");
    return Base.connectedTo({ shard: shardKey }, () =>
      Base.prohibitShardSwapping(() => block(), this.options.lock ?? true),
    ) as Promise<T>;
  }
}
