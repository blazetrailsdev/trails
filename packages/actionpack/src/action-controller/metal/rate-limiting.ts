/**
 * ActionController::RateLimiting
 *
 * Applies a rate limit to controller actions, refusing requests that
 * exceed the limit with 429 Too Many Requests.
 * @see https://api.rubyonrails.org/classes/ActionController/RateLimiting.html
 */

import { Notifications } from "@blazetrails/activesupport";
import type { CallbackOptions } from "../../abstract-controller/callbacks.js";

/**
 * Options accepted by the `rateLimit` class DSL.
 *
 * The generic `TController` parameter widens the `this` type seen inside
 * `by`/`with` callbacks. Rails runs them via `instance_exec`, so callbacks
 * can reach params/session/request — pass your controller class type to
 * surface that API without casts:
 *
 *     PostsController.rateLimit<PostsController>({
 *       to: 10, within: 60,
 *       by() { return this.request.getHeader("x-api-key") ?? this.request.remoteIp; },
 *     });
 */
export interface RateLimitOptions<TController = RateLimitingHost> {
  /** Maximum number of requests allowed within the window. */
  to: number;
  /** Window length in seconds (Rails uses `ActiveSupport::Duration`). */
  within: number;
  /**
   * Per-request identity function. Default is the remote IP. Invoked with
   * the controller as `this`, matching Rails' `instance_exec(&by)`.
   */
  by?: (this: TController) => string | null | undefined;
  /**
   * Action to take when the limit is exceeded. Invoked with the controller
   * as `this`. Defaults to `head(429)`. Matches Rails' Symbol/Integer status
   * shape: `this.head("too_many_requests")` is valid.
   */
  with?: (this: TController) => void | Promise<void>;
  /** Cache backend used to count requests. Defaults to the host's cacheStore. */
  store?: RateLimitStore;
  /** Distinct name when multiple rate limits are stacked on one controller. */
  name?: string;
  /** Standard before_action `only:` filter. */
  only?: string | string[];
  /** Standard before_action `except:` filter. */
  except?: string | string[];
  /** Standard before_action `if:` filter. */
  if?: CallbackOptions["if"];
  /** Standard before_action `unless:` filter. */
  unless?: CallbackOptions["unless"];
  /** Prepend the before_action (Rails `prepend: true`). */
  prepend?: boolean;
}

/**
 * Minimal cache-backend contract used by `rateLimiting`.
 *
 * Mirrors `ActiveSupport::Cache::Store#increment(key, amount, expires_in:)`
 * but typed in camelCase. Implementations may be sync or async; the helper
 * awaits the return value.
 */
export interface RateLimitStore {
  increment(
    key: string,
    amount: number,
    options: { expiresIn: number },
  ): number | null | Promise<number | null>;
}

/**
 * In-memory `RateLimitStore` for tests and single-process apps.
 *
 * Expiry is checked lazily on each `increment` for the touched key, matching
 * `activesupport/cache/memory-store` (memory-store.ts:135). To prevent
 * unbounded growth from one-off identities, the store also sweeps expired
 * entries once the map crosses `_pruneThreshold` (starts at 1024). After a
 * sweep, the next threshold tracks current load: if the sweep freed space,
 * it's set to `max(baseline, liveCount * 2)` — proportional to remaining
 * entries, so post-burst the cadence relaxes only as far as the live load
 * warrants and drops back to the baseline once load recedes. If the sweep
 * freed nothing (every entry still live), the threshold doubles to
 * amortize the O(N) walk against the next burst.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private static readonly _PRUNE_BASELINE = 1024;
  private static readonly _PRUNE_MAX = MemoryRateLimitStore._PRUNE_BASELINE * 16;
  private _entries = new Map<string, { count: number; expiresAt: number }>();
  private _pruneThreshold = MemoryRateLimitStore._PRUNE_BASELINE;
  /**
   * Inserts to defer before re-sweeping after a sterile sweep at the cap
   * (every entry still live; no space was reclaimed). Without this, once
   * `_pruneThreshold` saturates at `_PRUNE_MAX` under sustained all-live
   * traffic, every subsequent insert would re-trigger the O(N) walk because
   * `size >= threshold` stays true. Counting down a baseline of inserts
   * amortizes the next walk against another `_PRUNE_BASELINE` requests so
   * the steady-state cost stays O(1) per increment.
   */
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
      // Nothing freed: every entry is live. Double threshold up to the cap.
      // Once at the cap, defer the next sweep by a full baseline of inserts
      // so the all-live state can't make every request O(N).
      this._pruneThreshold *= 2;
      if (this._pruneThreshold >= MemoryRateLimitStore._PRUNE_MAX) {
        this._pruneThreshold = MemoryRateLimitStore._PRUNE_MAX;
        this._skipSweepInserts = MemoryRateLimitStore._PRUNE_BASELINE;
      }
    }
  }
}

/** Returns true when `count` exceeds `limit`. */
export function isRateLimited(count: number, limit: number): boolean {
  return count > limit;
}

/**
 * Host contract for the class DSL: the controller class must expose
 * `beforeAction` and a default `cacheStore`. Matches the subset of
 * `AbstractController` + `ActionController::Base` that Rails' DSL touches.
 */
// `beforeAction` is intentionally untyped on this contract: AbstractController
// types its callback against AbstractController, but the DSL only needs the
// method to exist on the host class. Concrete subclasses (Base/Metal) supply
// the stricter type at the call site.
export interface RateLimitingClassHost {
  beforeAction: Function; // eslint-disable-line @typescript-eslint/no-unsafe-function-type
  /**
   * Mirrors the existing `cacheStore?: ... | null` convention on
   * AbstractController caching/fragments (caching.ts:35, fragments.ts:24).
   *
   * NOTE: The Rails `cache_store` slot is normally an
   * `ActiveSupport::Cache::Store`, but for rate limiting it must satisfy the
   * stricter `RateLimitStore` contract — `expiresIn` in **seconds** and a
   * counter initialized to `amount` on first call (Redis/Memcached
   * behavior). The in-memory activesupport cache (`@blazetrails/activesupport`
   * `MemoryStore`) uses millisecond `expiresIn` and returns `null` for
   * missing keys, so plugging it in here will silently disable enforcement
   * (matches Rails — same caveat applies to `ActiveSupport::Cache::MemoryStore`
   * upstream). See the "RateLimiting" entry in
   * docs/actionpack-100-percent.md, "ActionController — remaining" →
   * "Known divergences from Rails (intentional)".
   */
  cacheStore?: RateLimitStore | null;
}

/**
 * Host contract for the instance helper: each request needs an identifying
 * string (Rails uses `request.remote_ip`) and a sink for over-limit responses.
 */
export interface RateLimitingHost {
  /**
   * Rails delegates `controller_path` to the class; Metal exposes it as an
   * instance method. Accept either a method or a string property so the
   * helper composes the right cache key under both shapes.
   */
  controllerPath?: string | (() => string);
  request?: { remoteIp?: string | null };
  /**
   * `Metal#head` accepts numeric statuses and Rails-style symbol names
   * (`"too_many_requests"`) — see action-controller/metal.ts:223. Keep this
   * type aligned so `with() { this.head("too_many_requests") }` typechecks.
   */
  head?: (status: number | string) => void;
  /**
   * Per-request enforcement entrypoint. Rails' `before_action` block calls
   * `self.rate_limiting(...)` so subclass overrides win
   * (rate_limiting.rb:56). Wired as a static-bound method on Base/API; the
   * DSL dispatches through this slot to preserve override semantics.
   */
  rateLimiting?: typeof rateLimiting;
}

/**
 * Class DSL: register a rate limit on all actions (or `only:`/`except:`).
 *
 * Mirrors Rails `ActionController::RateLimiting::ClassMethods#rate_limit`
 * (actionpack/lib/action_controller/metal/rate_limiting.rb, lines 55–57):
 *
 *     def rate_limit(to:, within:, by: -> { request.remote_ip },
 *                    with: -> { head :too_many_requests },
 *                    store: cache_store, name: nil, **options)
 *       before_action -> {
 *         rate_limiting(to:, within:, by:, with:, store:, name:)
 *       }, **options
 *     end
 */
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
    // Dispatch through the instance's own `rateLimiting` slot so subclass
    // overrides win (matches Rails' `before_action -> { rate_limiting(...) }`
    // which calls `self.rate_limiting`). Fall back to the module function so
    // hosts that haven't wired the instance method still work.
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

/**
 * Private instance helper invoked by the registered `beforeAction`.
 *
 * Mirrors Rails `ActionController::RateLimiting#rate_limiting`
 * (actionpack/lib/action_controller/metal/rate_limiting.rb, lines 61–69).
 *
 * @internal
 */
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
