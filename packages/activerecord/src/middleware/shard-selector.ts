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

type ShardResolverFn = (request: ShardRequest) => string;

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

  /**
   * @missingRailsCall new — CONVERGEABLE: shard_selector.rb:41 wraps env in
   * ActionDispatch::Request.new(env); trails has no ActionDispatch, so call()
   * receives the request itself and constructs nothing.
   */
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
  selectedShard(request: ShardRequest): string {
    return this.resolver(request);
  }

  private async setShard<T>(shard: string, block: () => T | Promise<T>): Promise<T> {
    return Base.connectedTo({ shard }, () =>
      // `options.fetch(:lock, true)` (shard_selector.rb:66) returns the STORED
      // value whenever the key is present — including an explicit nil — so the
      // stored-key test is spelled out rather than written as `?? true`.
      Base.prohibitShardSwapping(() => block(), "lock" in this.options ? this.options.lock : true),
    ) as Promise<T>;
  }
}
