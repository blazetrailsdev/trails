import { Notifications } from "@blazetrails/activesupport";
import type { CallbackOptions } from "../../abstract-controller/callbacks.js";

export interface RateLimitOptions<TController = RateLimitingHost> {
  to: number;
  within: number;
  by?: (this: TController) => string | null | undefined;
  with?: (this: TController) => void | Promise<void>;
  store?: RateLimitStore;
  name?: string;
  only?: string | string[];
  except?: string | string[];
  if?: CallbackOptions["if"];
  unless?: CallbackOptions["unless"];
  prepend?: boolean;
}

export interface RateLimitStore {
  increment(
    key: string,
    amount: number,
    options: { expiresIn: number },
  ): number | null | Promise<number | null>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private static readonly _PRUNE_BASELINE = 1024;
  private static readonly _PRUNE_MAX = MemoryRateLimitStore._PRUNE_BASELINE * 16;
  private _entries = new Map<string, { count: number; expiresAt: number }>();
  private _pruneThreshold = MemoryRateLimitStore._PRUNE_BASELINE;
  private _skipSweepInserts = 0;

  increment(key: string, amount: number, options: { expiresIn: number }): number {
    const now = Date.now();
    const entry = this._entries.get(key);
    if (entry && entry.expiresAt > now) {
      entry.count += amount;
      return entry.count;
    }
    this._entries.set(key, { count: amount, expiresAt: now + options.expiresIn * 1000 });
    if (this._entries.size >= this._pruneThreshold) {
      if (this._skipSweepInserts > 0) {
        this._skipSweepInserts -= 1;
      } else {
        this._pruneExpired(now);
      }
    }
    return amount;
  }

  private _pruneExpired(now: number): void {
    const before = this._entries.size;
    for (const [key, entry] of this._entries) {
      if (entry.expiresAt <= now) this._entries.delete(key);
    }
    if (this._entries.size < before) {
      this._pruneThreshold = Math.max(MemoryRateLimitStore._PRUNE_BASELINE, this._entries.size * 2);
      this._skipSweepInserts = 0;
    } else {
      this._pruneThreshold *= 2;
      if (this._pruneThreshold >= MemoryRateLimitStore._PRUNE_MAX) {
        this._pruneThreshold = MemoryRateLimitStore._PRUNE_MAX;
        this._skipSweepInserts = MemoryRateLimitStore._PRUNE_BASELINE;
      }
    }
  }
}

export function isRateLimited(count: number, limit: number): boolean {
  return count > limit;
}

export interface RateLimitingClassHost {
  beforeAction: Function; // eslint-disable-line @typescript-eslint/no-unsafe-function-type
  cacheStore?: RateLimitStore | null;
}

export interface RateLimitingHost {
  controllerPath?: string | (() => string);
  request?: { remoteIp?: string | null };
  head?: (status: number | string) => void;
  rateLimiting?: typeof rateLimiting;
}

export function rateLimit<TController extends RateLimitingHost = RateLimitingHost>(
  this: RateLimitingClassHost,
  options: RateLimitOptions<TController>,
): void {
  const {
    to,
    within,
    by,
    with: withCallback,
    store,
    name,
    only,
    except,
    if: ifFilter,
    unless: unlessFilter,
    prepend,
  } = options;
  const resolvedStore = store ?? this.cacheStore;
  if (!resolvedStore) {
    throw new Error(
      "rateLimit requires a `store:` option or a `cacheStore` on the controller class.",
    );
  }
  const filter: CallbackOptions = {};
  if (only !== undefined) filter.only = Array.isArray(only) ? only : [only];
  if (except !== undefined) filter.except = Array.isArray(except) ? except : [except];
  if (ifFilter !== undefined) filter.if = ifFilter;
  if (unlessFilter !== undefined) filter.unless = unlessFilter;
  if (prepend !== undefined) filter.prepend = prepend;

  const callback = async (controller: RateLimitingHost): Promise<void> => {
    const fn = controller.rateLimiting ?? rateLimiting;
    await fn.call(controller, {
      to,
      within,
      by: by as ((this: RateLimitingHost) => string | null | undefined) | undefined,
      with: withCallback as ((this: RateLimitingHost) => void | Promise<void>) | undefined,
      store: resolvedStore,
      name,
    });
  };
  (this.beforeAction as (cb: typeof callback, opts?: CallbackOptions) => void)(callback, filter);
}

/** @internal */
export async function rateLimiting(
  this: RateLimitingHost,
  args: {
    to: number;
    within: number;
    by?: (this: RateLimitingHost) => string | null | undefined;
    with?: (this: RateLimitingHost) => void | Promise<void>;
    store: RateLimitStore;
    name?: string;
  },
): Promise<void> {
  const identity = args.by ? args.by.call(this) : (this.request?.remoteIp ?? null);
  const controllerPath =
    typeof this.controllerPath === "function" ? this.controllerPath() : this.controllerPath;
  const cacheKey = ["rate-limit", controllerPath, args.name, identity]
    .filter((part): part is string => part != null)
    .join(":");
  const count = await args.store.increment(cacheKey, 1, { expiresIn: args.within });
  if (count != null && isRateLimited(count, args.to)) {
    await Notifications.instrumentAsync(
      "rate_limit.action_controller",
      { request: this.request },
      async () => {
        if (args.with) {
          await args.with.call(this);
        } else if (this.head) {
          this.head(429);
        }
      },
    );
  }
}
