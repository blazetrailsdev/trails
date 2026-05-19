/**
 * AbstractController::Callbacks
 *
 * Callback type definitions, options, and option-normalization helpers
 * for AbstractController action lifecycle.
 * @see https://api.rubyonrails.org/classes/AbstractController/Callbacks.html
 */

import type { AbstractController } from "./base.js";

export type ActionCallback = (
  controller: AbstractController,
) => void | Promise<void> | boolean | Promise<boolean>;

export type AroundCallback = (
  controller: AbstractController,
  next: () => Promise<void>,
) => void | Promise<void>;

/**
 * A predicate object stored on a callback's `if`/`unless` list after
 * normalization, used to match the action name being processed.
 */
export interface CallbackPredicateLike {
  isMatch(controller: AbstractController): boolean;
}

export interface CallbackOptions {
  only?: string | string[];
  except?: string | string[];
  if?:
    | ((controller: AbstractController) => boolean)
    | Array<((controller: AbstractController) => boolean) | CallbackPredicateLike>;
  unless?:
    | ((controller: AbstractController) => boolean)
    | Array<((controller: AbstractController) => boolean) | CallbackPredicateLike>;
  prepend?: boolean;
  /** @internal Used by _insertCallbacks to feed filter names into ActionFilter. */
  filters?: Array<ActionCallback | AroundCallback>;
}

export interface CallbackEntry {
  callback: ActionCallback | AroundCallback;
  type: "before" | "after" | "around";
  options: CallbackOptions;
}

/**
 * Matches the controller's current action name against a fixed set of
 * action names. Stored on `if`/`unless` after `only`/`except` are
 * normalized away. Mirrors AbstractController::Callbacks::ActionFilter.
 *
 * @internal
 */
export class ActionFilter implements CallbackPredicateLike {
  private readonly _filters: ReadonlyArray<ActionCallback | AroundCallback>;
  private readonly _conditionalKey: "only" | "except";
  private readonly _actions: ReadonlySet<string>;

  constructor(
    filters: ReadonlyArray<ActionCallback | AroundCallback>,
    conditionalKey: "only" | "except",
    actions: string | string[],
  ) {
    this._filters = filters.slice();
    this._conditionalKey = conditionalKey;
    this._actions = new Set((Array.isArray(actions) ? actions : [actions]).map((a) => String(a)));
  }

  /** True iff the controller's current action is in the configured set. */
  isMatch(controller: AbstractController): boolean {
    return this._actions.has(controller.actionName);
  }

  /**
   * Rails aliases `after`/`before`/`around` to `match?` so the same
   * filter object can be invoked by ActiveSupport::Callbacks for each
   * callback kind. Mirrored here for fidelity even though our dispatch
   * doesn't currently look them up by kind.
   *
   * @internal
   */
  after(controller: AbstractController): boolean {
    return this.isMatch(controller);
  }
  /** @internal */
  before(controller: AbstractController): boolean {
    return this.isMatch(controller);
  }
  /** @internal */
  around(controller: AbstractController): boolean {
    return this.isMatch(controller);
  }

  /** @internal */
  get filters(): ReadonlyArray<ActionCallback | AroundCallback> {
    return this._filters;
  }

  /** @internal */
  get conditionalKey(): "only" | "except" {
    return this._conditionalKey;
  }
}

/**
 * If `:only` or `:except` are used, convert them into the `:if` and
 * `:unless` options expected by the callback engine.
 *
 * @internal
 */
export function _normalizeCallbackOptions(options: CallbackOptions): void {
  _normalizeCallbackOption(options, "only", "if");
  _normalizeCallbackOption(options, "except", "unless");
}

/**
 * Convert one of `:only`/`:except` on `options` into a prepended
 * ActionFilter on the corresponding `:if`/`:unless` slot.
 *
 * @internal
 */
export function _normalizeCallbackOption(
  options: CallbackOptions,
  from: "only" | "except",
  to: "if" | "unless",
): void {
  const fromValue = options[from];
  if (fromValue === undefined) return;
  delete options[from];

  const filters = options.filters ?? [];
  const filter = new ActionFilter(filters, from, fromValue);

  const existing = options[to];
  const list: Array<((controller: AbstractController) => boolean) | CallbackPredicateLike> =
    existing === undefined ? [] : Array.isArray(existing) ? existing.slice() : [existing];
  list.unshift(filter);
  options[to] = list;
}

/**
 * Take an array of callbacks (optionally followed by an options object)
 * and an optional block, normalize the options, then invoke `yieldFn`
 * for each callback. Mirrors Rails' `_insert_callbacks`.
 *
 * In Ruby this is `extract_options!` + `yield`. In TypeScript callers
 * typically already split callbacks from options, so we accept an
 * explicit `options` parameter and an optional `block`.
 *
 * @internal
 */
export function _insertCallbacks(
  callbacks: Array<ActionCallback | AroundCallback>,
  options: CallbackOptions,
  block: ActionCallback | AroundCallback | null,
  yieldFn: (callback: ActionCallback | AroundCallback, options: CallbackOptions) => void,
): void {
  if (block) callbacks.push(block);
  options.filters = callbacks;
  _normalizeCallbackOptions(options);
  delete options.filters;
  for (const callback of callbacks) {
    yieldFn(callback, options);
  }
}
