import {
  Concern,
  Module,
  Notifications,
  extend,
  type CacheStore,
  type Duration,
  type Included,
} from "@blazetrails/activesupport";
import { compact } from "@blazetrails/ruby-compat";
import type { Request } from "../../action-dispatch/http/request.js";
import type { CallbackOptions, beforeAction } from "../../abstract-controller/callbacks.js";

type Block = (this: any) => unknown;

/** @internal */
export interface RateLimitingClassHost {
  beforeAction: OmitThisParameter<typeof beforeAction>;
  cacheStore: CacheStore | null;
}

interface RateLimitingHost {
  request: Request;
  controllerPath(): string;
  head(status: number | string): unknown;
}

export const ClassMethods = {
  rateLimit(
    this: RateLimitingClassHost,
    {
      to,
      within,
      by = function (this: RateLimitingHost) {
        return this.request.remoteIp;
      },
      with: with_ = function (this: RateLimitingHost) {
        return this.head("too_many_requests");
      },
      store = this.cacheStore!,
      name = null,
      ...options
    }: {
      to: number;
      within: number | Duration;
      by?: Block;
      with?: Block;
      store?: CacheStore;
      name?: string | null;
    } & CallbackOptions,
  ): void {
    this.beforeAction(
      (controller) =>
        (controller as unknown as Included<typeof RateLimiting>).rateLimiting({
          to: to,
          within: within,
          by: by,
          with: with_,
          store: store,
          name: name,
        }),
      options,
    );
  },
};

export const RateLimiting = new Module((mod) => {
  extend(mod, Concern);

  mod.defineMethod("rateLimiting", rateLimiting);
}) as Module<{ rateLimiting: typeof rateLimiting }> & { ClassMethods: typeof ClassMethods };
RateLimiting.ClassMethods = ClassMethods;

/** @internal */
export async function rateLimiting(
  this: RateLimitingHost,
  {
    to,
    within,
    by,
    with: with_,
    store,
    name,
  }: {
    to: number;
    within: number | Duration;
    by: Block;
    with: Block;
    store: CacheStore;
    name: string | null;
  },
): Promise<void> {
  const cacheKey = compact(["rate-limit", this.controllerPath(), name, by.call(this)]).join(":");
  const count = await store.increment(cacheKey, 1, { expiresIn: within });
  if (count != null && count > to) {
    await Notifications.instrument("rate_limit.action_controller", { request: this.request }, () =>
      with_.call(this),
    );
  }
}
