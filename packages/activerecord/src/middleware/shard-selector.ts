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
  readonly resolver: ShardResolverFn;
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
   * @missingRailsCall new — CONVERGEABLE: `ActionDispatch::Request.new(env)`
   *   (`shard_selector.rb:41`) wraps the rack env before the resolver sees it.
   *   `ActionDispatch::Request` lives in `@blazetrails/actionpack`, so `call()` is handed the
   *   request object itself and constructs nothing. Ruby resolves the constant
   *   when `call` runs, so activerecord takes no load-time dependency on
   *   actionpack — `activerecord.gemspec` declares no actionpack dependency. An
   *   ESM `import` is eager, so naming the constant here would make actionpack a
   *   hard dependency of activerecord that Rails does not have. Convergeable once
   *   the constant can be reached at call time (RFC 0106).
   */
  async call(request: ShardRequest): Promise<unknown> {
    const shard = this.selectedShard(request);
    return this.setShard(shard, () => this.app(request));
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE reads ActiveSupport::Notifications, which Ruby names directly in the middleware body (middleware/shard_selector.rb:36).
   */
  instrumenter(): typeof Notifications {
    return Notifications;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE reads the the resolver ivar ShardSelector keeps (middleware/shard_selector.rb:26); Ruby has no reader for it.
   */
  shardResolver(): ShardResolverFn {
    return this.resolver;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE reads the the options-derived lock setting (middleware/shard_selector.rb:28); Ruby reads the ivar inline.
   */
  shardSelectorStrategy(): { lock: boolean } {
    return { lock: this.options.lock ?? true };
  }

  /** @internal */
  selectedShard(request: ShardRequest): string {
    return this.resolver(request);
  }

  /**
   * @missingRailsCall fetch — PERMANENT: Verified per-site (RFC 0106):
   *   `options.fetch(:lock, true)` (`shard_selector.rb:66`) — the options hash
   *   is a plain TS object, so the stored-key test `Hash#fetch` performs is
   *   spelled `"lock" in this.options ? ... : true`. `fetch` has no TS call
   *   spelling.
   */
  private async setShard<T>(shard: string, block: () => T | Promise<T>): Promise<T> {
    return Base.connectedTo({ shard }, () =>
      // `options.fetch(:lock, true)` (shard_selector.rb:66) returns the STORED
      // value whenever the key is present — including an explicit nil — so the
      // stored-key test is spelled out rather than written as `?? true`.
      Base.prohibitShardSwapping(() => block(), "lock" in this.options ? this.options.lock : true),
    ) as Promise<T>;
  }
}
