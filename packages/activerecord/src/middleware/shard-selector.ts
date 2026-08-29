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

  /** @missingRailsCall new — CONVERGEABLE */
  async call(request: ShardRequest): Promise<unknown> {
    const shard = this.selectedShard(request);
    return this.setShard(shard, () => this.app(request));
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE
   */
  instrumenter(): typeof Notifications {
    return Notifications;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE
   */
  shardResolver(): ShardResolverFn {
    return this.resolver;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE
   */
  shardSelectorStrategy(): { lock: boolean } {
    return { lock: this.options.lock ?? true };
  }

  /** @internal */
  selectedShard(request: ShardRequest): string {
    return this.resolver(request);
  }

  /** @missingRailsCall fetch — PERMANENT */
  private async setShard<T>(shard: string, block: () => T | Promise<T>): Promise<T> {
    return Base.connectedTo({ shard }, () =>
      Base.prohibitShardSwapping(() => block(), "lock" in this.options ? this.options.lock : true),
    ) as Promise<T>;
  }
}
