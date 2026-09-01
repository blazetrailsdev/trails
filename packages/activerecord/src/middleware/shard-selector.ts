import { fetch } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { Notifications, _ActionDispatchRequest } from "@blazetrails/activesupport";

export interface ShardRequest {
  method: string;
  [key: string]: unknown;
}

type ShardResolverFn = (request: ShardRequest) => string;

export class ShardSelector {
  readonly resolver: ShardResolverFn;
  readonly options: { lock?: boolean };

  private readonly app: (env: Record<string, unknown>) => Promise<unknown>;

  constructor(
    app: (env: Record<string, unknown>) => Promise<unknown>,
    resolver: ShardResolverFn,
    options: { lock?: boolean } = {},
  ) {
    this.app = app;
    this.resolver = resolver;
    this.options = options;
  }

  async call(env: Record<string, unknown>): Promise<unknown> {
    const request = new _ActionDispatchRequest!(env) as ShardRequest;

    const shard = this.selectedShard(request);

    return this.setShard(shard, () => this.app(env));
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE mirrors Resolver#instrumenter (middleware/database_selector/resolver.rb:33), which ShardSelector has no counterpart for.
   */
  instrumenter(): typeof Notifications {
    return Notifications;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE ShardSelector#resolver (middleware/shard_selector.rb:38) under a longer name; the Rails spelling is the convergence.
   */
  shardResolver(): ShardResolverFn {
    return this.resolver;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE the `lock` read off ShardSelector#options (middleware/shard_selector.rb:38), which Ruby indexes inline at its use site.
   */
  shardSelectorStrategy(): { lock: boolean } {
    return { lock: this.options.lock ?? true };
  }

  /** @internal */
  selectedShard(request: ShardRequest): string {
    return this.resolver(request);
  }

  private async setShard<T>(shard: string, block: () => T | Promise<T>): Promise<T> {
    return Base.connectedTo({ shard }, () =>
      Base.prohibitShardSwapping(
        () => block(),
        fetch<boolean>(this.options as Record<string, unknown>, "lock", true),
      ),
    ) as Promise<T>;
  }
}
