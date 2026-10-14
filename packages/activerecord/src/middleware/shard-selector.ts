import { fetch } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { TopLevel } from "@blazetrails/activesupport";

export type ShardRequest = InstanceType<NonNullable<typeof TopLevel.ActionDispatch>["Request"]> & {
  method: string;
  [key: string]: unknown;
};

type ShardResolverFn = (request: ShardRequest) => string;

export class ShardSelector {
  readonly resolver: ShardResolverFn;
  readonly options: { lock?: boolean | null };

  private readonly app: (env: Record<string, unknown>) => Promise<unknown>;

  constructor(
    app: (env: Record<string, unknown>) => Promise<unknown>,
    resolver: ShardResolverFn,
    options: { lock?: boolean | null } = {},
  ) {
    this.app = app;
    this.resolver = resolver;
    this.options = options;
  }

  async call(env: Record<string, unknown>): Promise<unknown> {
    const request = new TopLevel.ActionDispatch!.Request(env) as ShardRequest;

    const shard = this.selectedShard(request);

    return this.setShard(shard, () => this.app(env));
  }

  /** @internal */
  selectedShard(request: ShardRequest): string {
    return this.resolver(request);
  }

  private async setShard<T>(shard: string, block: () => T | Promise<T>): Promise<T> {
    return Base.connectedTo({ shard }, () =>
      Base.prohibitShardSwapping(
        () => block(),
        fetch<boolean | null>(this.options as Record<string, unknown>, "lock", true),
      ),
    ) as Promise<T>;
  }
}
