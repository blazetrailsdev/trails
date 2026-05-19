/**
 * AbstractController::Callbacks
 *
 * Callback type definitions, options, and option-normalization helpers
 * for AbstractController action lifecycle.
 * @see https://api.rubyonrails.org/classes/AbstractController/Callbacks.html
 */

import { ActionNotFound, type AbstractController } from "./base.js";

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
  /**
   * Symbolic name for the callback. When a subclass registers a callback
   * with the same `name`, it replaces the inherited entry (Rails
   * identifies callbacks by symbol in AS::Callbacks). Without `name`,
   * callbacks are identified by function reference and don't dedup
   * across the inheritance chain.
   */
  name?: string;
  only?: string | string[];
  except?: string | string[];
  if?:
    | ((controller: AbstractController) => boolean)
    | Array<((controller: AbstractController) => boolean) | CallbackPredicateLike>;
  unless?:
    | ((controller: AbstractController) => boolean)
    | Array<((controller: AbstractController) => boolean) | CallbackPredicateLike>;
  prepend?: boolean;
}

/**
 * Internal extension of CallbackOptions used by _insertCallbacks /
 * _normalizeCallbackOption to thread the registered callback list
 * through to ActionFilter (mirrors Rails' `options[:filters]`).
 *
 * @internal
 */
type CallbackOptionsWithFilters = CallbackOptions & {
  filters?: Array<ActionCallback | AroundCallback>;
};

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
    const Constructor = controller.constructor as { raiseOnMissingCallbackActions?: boolean };
    if (Constructor.raiseOnMissingCallbackActions) {
      const missing = [...this._actions].find((a) => !controller.isAvailableAction(a));
      if (missing !== undefined) {
        const names =
          this._filters.length === 1
            ? _inspectFilter(this._filters[0]!)
            : `[${this._filters.map(_inspectFilter).join(", ")}]`;
        // Ruby `:key.inspect` renders as `:key`; preserve that for parity
        // with Rails' error message format (the literal `:only` / `:except`).
        const message =
          `The ${missing} action could not be found for the ${names} ` +
          `callback on ${controller.constructor.name}, but it is listed in the controller's ` +
          `:${this._conditionalKey} option.\n\n` +
          `Raising for missing callback actions is a new default in Rails 7.1; ` +
          `set \`raiseOnMissingCallbackActions = false\` on the controller class to opt out.`;
        throw new ActionNotFound(message, controller, missing);
      }
    }
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

  const filters = (options as CallbackOptionsWithFilters).filters ?? [];
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
  // Rails splats `*names` into a fresh array, so its in-place push is
  // invisible to callers. JS callers own the array they pass in — copy
  // to preserve that effective immutability.
  const list = callbacks.slice();
  if (block) list.push(block);
  const opts = options as CallbackOptionsWithFilters;
  opts.filters = list;
  _normalizeCallbackOptions(options);
  delete opts.filters;
  for (const callback of list) {
    yieldFn(callback, options);
  }
}

function _actionList(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

/** Named fn → `:name`; anon → `#<Proc:…>` (Rails Proc#inspect parity). @internal */
function _inspectFilter(filter: ActionCallback | AroundCallback): string {
  const fn = filter as { name?: string };
  return fn.name && fn.name.length > 0 ? `:${fn.name}` : "#<Proc:anonymous>";
}

function _shouldRun(controller: AbstractController, entry: CallbackEntry, action: string): boolean {
  const opts = entry.options;
  if (opts.only !== undefined && !_actionList(opts.only).includes(action)) return false;
  if (opts.except !== undefined && _actionList(opts.except).includes(action)) return false;
  if (opts.if !== undefined && !_evalPredicate(controller, opts.if, true)) return false;
  if (opts.unless !== undefined && _evalPredicate(controller, opts.unless, false)) return false;
  return true;
}

function _evalPredicate(
  controller: AbstractController,
  pred: NonNullable<CallbackOptions["if"]>,
  requireAll: boolean,
): boolean {
  if (typeof pred === "function") return pred(controller);
  if (requireAll) {
    for (const p of pred) {
      if (!(typeof p === "function" ? p(controller) : p.isMatch(controller))) return false;
    }
    return true;
  }
  for (const p of pred) {
    if (typeof p === "function" ? p(controller) : p.isMatch(controller)) return true;
  }
  return false;
}

/**
 * Rails `AC::Callbacks#process_action` — wraps the dispatch with the
 * registered `:process_action` callbacks. Ruby uses a `run_callbacks { super }`
 * override; here the wrapping lives in callbacks.ts and `Base#processAction`
 * delegates to it so the file layout matches Rails.
 * @internal
 */
export async function processAction(
  controller: AbstractController,
  action: string,
  dispatch: () => Promise<void>,
): Promise<void> {
  const Constructor = controller.constructor as unknown as {
    getCallbacks: () => CallbackEntry[];
    getSkipped: () => Array<{
      callback: ActionCallback | AroundCallback;
      options: CallbackOptions;
    }>;
  };
  const allCallbacks = Constructor.getCallbacks();
  const skipped = Constructor.getSkipped();

  const callbacks = allCallbacks.filter((entry) => {
    return !skipped.some((s) => {
      if (s.callback !== entry.callback) return false;
      if (s.options.only !== undefined && !_actionList(s.options.only).includes(action))
        return false;
      if (s.options.except !== undefined && _actionList(s.options.except).includes(action))
        return false;
      return true;
    });
  });

  const befores = callbacks.filter((c) => c.type === "before" && _shouldRun(controller, c, action));
  const afters = callbacks.filter((c) => c.type === "after" && _shouldRun(controller, c, action));
  const arounds = callbacks.filter((c) => c.type === "around" && _shouldRun(controller, c, action));

  const executeAction = async (): Promise<void> => {
    for (const entry of befores) {
      if (controller.performed) return;
      const result = await (entry.callback as ActionCallback)(controller);
      if (result === false) return;
    }
    if (controller.performed) return;
    await dispatch();
    for (const entry of afters.reverse()) {
      await (entry.callback as ActionCallback)(controller);
    }
  };

  let chain = executeAction;
  for (const around of arounds.reverse()) {
    const inner = chain;
    chain = async () => {
      await (around.callback as AroundCallback)(controller, inner);
    };
  }

  await chain();
}
