/**
 * Mirrors: ActiveRecord::Middleware::ShardSelector
 *
 * Middleware for automatic shard selection based on request context.
 */

import { Base } from "../base.js";
import { Notifications } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";

export interface ShardRequest {
  method: string;
  [key: string]: unknown;
}

type ShardResolverFn = (request: ShardRequest) => string | symbol;

export class ShardSelector {
  /** @internal */
  readonly resolver: ShardResolverFn;
  /** @internal */
  readonly options: { lock?: boolean };

  private readonly app: (request: ShardRequest) => Promise<unknown>;

  constructor(
    app: (request: ShardRequest) => Promise<unknown>,
    resolver: ShardResolverFn,
    options: { lock?: boolean } = {},
  ) {
    this.app = app;
    this.resolver = resolver;
    this.options = options;
  }

  async call(request: ShardRequest): Promise<unknown> {
    const shard = this.selectedShard(request);
    return this.setShard(shard, () => this.app(request));
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

  private async setShard<T>(shard: string | symbol, block: () => T | Promise<T>): Promise<T> {
    let shardKey: string;
    if (typeof shard === "string") {
      shardKey = shard;
    } else {
      const name = Symbol.keyFor(shard) ?? shard.description;
      if (!name) throw new ArgumentError(`Cannot convert symbol to shard key: ${String(shard)}`);
      shardKey = name;
    }
    return Base.connectedTo({ shard: shardKey }, () =>
      Base.prohibitShardSwapping(() => block(), this.options.lock ?? true),
    ) as Promise<T>;
  }
}
