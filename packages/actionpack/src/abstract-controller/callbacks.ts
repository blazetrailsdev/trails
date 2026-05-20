/**
 * AbstractController::Callbacks
 *
 * Action callback type definitions, option normalization, and the
 * ActiveSupport::Callbacks integration that wires AbstractController#processAction
 * onto an AS callback chain.
 * @see https://api.rubyonrails.org/classes/AbstractController/Callbacks.html
 */

import {
  defineCallbacks as asDefineCallbacks,
  setCallback as asSetCallback,
  runCallbacks as asRunCallbacks,
  getCallbackChains,
  type CallbackKind,
  type CallbackCondition,
  type CallbackOptions as ASCallbackOptions,
} from "@blazetrails/activesupport";
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

/** Name of the AS::Callbacks chain that backs `processAction`. @internal */
export const PROCESS_ACTION_CHAIN = "processAction";

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

/** Named fn → `:name`; anon → `#<Proc:…>` (Rails Proc#inspect parity). @internal */
function _inspectFilter(filter: ActionCallback | AroundCallback): string {
  const fn = filter as { name?: string };
  return fn.name && fn.name.length > 0 ? `:${fn.name}` : "#<Proc:anonymous>";
}

/** Lower CallbackPredicateLike entries (ActionFilter) into plain fns for AS. @internal */
function _toConditionFns(pred: CallbackOptions["if"]): CallbackCondition[] | undefined {
  if (pred === undefined) return undefined;
  const list = Array.isArray(pred) ? pred : [pred];
  return list.map((item) =>
    typeof item === "function"
      ? (item as unknown as CallbackCondition)
      : (c: object) => (item as CallbackPredicateLike).isMatch(c as AbstractController),
  );
}

interface WrappedBefore {
  (target: object): Promise<unknown>;
  __originalCb: ActionCallback;
}

/**
 * Wrap a before callback to halt (return `false`) once the controller is
 * marked performed. Replaces Rails' `terminator: ->(c, lambda) { lambda.call;
 * c.performed? }`: AS rejects custom terminators paired with async befores,
 * so we encode the check in the callback and rely on default `=== false` halt.
 * @internal
 */
function _wrapBefore(callback: ActionCallback): WrappedBefore {
  const wrapped = async (target: object): Promise<unknown> => {
    const result = await callback(target as AbstractController);
    if ((target as AbstractController).performed) return false;
    return result;
  };
  (wrapped as WrappedBefore).__originalCb = callback;
  return wrapped as WrappedBefore;
}

/** Provision the `processAction` AS::Callbacks chain on a class prototype. @internal */
export function _defineActionCallbacks(prototype: object): void {
  asDefineCallbacks(prototype, PROCESS_ACTION_CHAIN, { skipAfterCallbacksIfTerminated: true });
}

/** Register a before/after/around action callback on `prototype`. @internal */
export function _registerActionCallback(
  prototype: object,
  kind: CallbackKind,
  callback: ActionCallback | AroundCallback,
  options: CallbackOptions,
): void {
  const opts: CallbackOptionsWithFilters = { ...options, filters: [callback] };
  _normalizeCallbackOptions(opts);
  delete opts.filters;

  // Name-based dedup: AS::Callbacks#duplicates? only matches Symbol filters,
  // so trails dedupes by an explicit `name` stashed on options.
  if (options.name !== undefined) {
    const chain = getCallbackChains(prototype).get(PROCESS_ACTION_CHAIN);
    if (chain) {
      for (const cb of [...chain.entries]) {
        if (cb.kind !== kind) continue;
        const stored = (cb.options as Record<string, unknown>)._trailsName;
        if (stored === options.name) chain.delete(cb);
      }
    }
  }

  const asOpts: ASCallbackOptions & Record<string, unknown> = {};
  if (opts.prepend) asOpts.prepend = true;
  const ifFns = _toConditionFns(opts.if);
  const unlessFns = _toConditionFns(opts.unless);
  if (ifFns) asOpts.if = ifFns;
  if (unlessFns) asOpts.unless = unlessFns;
  if (options.name !== undefined) asOpts._trailsName = options.name;

  const filter = kind === "before" ? _wrapBefore(callback as ActionCallback) : callback;
  asSetCallback(
    prototype,
    PROCESS_ACTION_CHAIN,
    kind,
    filter as unknown as Parameters<typeof asSetCallback>[3],
    asOpts,
  );
}

/**
 * Skip an existing action callback. Mirrors Rails `skip_callback`: with
 * `if`/`unless`/`only`/`except`, replaces the entry with one whose
 * conditions are merged (`Callback#mergeConditionalOptions`); without
 * conditions, removes outright.
 * @internal
 */
export function _skipActionCallback(
  prototype: object,
  kind: CallbackKind,
  filter: ActionCallback | AroundCallback | string,
  options: CallbackOptions,
): void {
  const opts: CallbackOptionsWithFilters = {
    ...options,
    filters: typeof filter === "function" ? [filter] : [],
  };
  _normalizeCallbackOptions(opts);
  delete opts.filters;

  const chain = getCallbackChains(prototype).get(PROCESS_ACTION_CHAIN);
  if (!chain) return;

  const hasConditional = opts.if !== undefined || opts.unless !== undefined;
  const ifConds = _toConditionFns(opts.if) ?? [];
  const unlessConds = _toConditionFns(opts.unless) ?? [];

  for (const cb of [...chain.entries]) {
    if (cb.kind !== kind) continue;
    const stored = (cb.options as Record<string, unknown>)._trailsName;
    let matches: boolean;
    if (typeof filter === "string") {
      matches = stored === filter;
    } else if (kind === "before") {
      const wrapped = cb.filter as Partial<WrappedBefore>;
      matches = wrapped.__originalCb === filter || cb.filter === filter;
    } else {
      matches = cb.filter === filter;
    }
    if (!matches) continue;

    if (hasConditional) {
      const merged = cb.mergeConditionalOptions(
        { name: PROCESS_ACTION_CHAIN, config: cb.chainConfig },
        ifConds,
        unlessConds,
      );
      chain.insert(chain.index(cb), merged);
    }
    chain.delete(cb);
  }
}

/** Rails `AC::Callbacks#process_action` — runs the chain around `dispatch`. @internal */
export async function processAction(
  controller: AbstractController,
  _action: string,
  dispatch: () => Promise<void>,
): Promise<void> {
  await asRunCallbacks(controller, PROCESS_ACTION_CHAIN, dispatch);
}
