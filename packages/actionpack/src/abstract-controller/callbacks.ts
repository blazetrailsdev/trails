import {
  defineCallbacks as asDefineCallbacks,
  setCallback as asSetCallback,
  runCallbacks as asRunCallbacks,
  getCallbackChains,
  throwAbort,
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

export interface CallbackPredicateLike {
  isMatch(controller: AbstractController): boolean;
}

export interface CallbackOptions {
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

/** @internal */
type CallbackOptionsWithFilters = CallbackOptions & {
  filters?: Array<ActionCallback | AroundCallback>;
};

/** @internal */
export const PROCESS_ACTION_CHAIN = "processAction";

/** @internal */
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

  isMatch(controller: AbstractController): boolean {
    const Constructor = controller.constructor as { raiseOnMissingCallbackActions?: boolean };
    if (Constructor.raiseOnMissingCallbackActions) {
      const missingAction = [...this._actions].find((a) => !controller.isAvailableAction(a));
      if (missingAction !== undefined) {
        const filterNames =
          this._filters.length === 1
            ? _inspectFilter(this._filters[0])
            : `[${this._filters.map(_inspectFilter).join(", ")}]`;
        const message =
          `The ${missingAction} action could not be found for the ${filterNames} ` +
          `callback on ${controller.constructor.name}, but it is listed in the controller's ` +
          `:${this._conditionalKey} option.\n\n` +
          `Raising for missing callback actions is a new default in Rails 7.1; ` +
          `set \`raiseOnMissingCallbackActions = false\` on the controller class to opt out.`;
        throw new ActionNotFound(message, controller, missingAction);
      }
    }
    return this._actions.has(controller.actionName);
  }

  /** @internal */
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
}

/** @internal */
export function _normalizeCallbackOptions(options: CallbackOptions): void {
  _normalizeCallbackOption(options, "only", "if");
  _normalizeCallbackOption(options, "except", "unless");
}

/** @internal */
export function _normalizeCallbackOption(
  options: CallbackOptions,
  from: "only" | "except",
  to: "if" | "unless",
): void {
  let fromValue: string | string[] | ActionFilter | undefined = options[from];
  if (fromValue === undefined) return;
  delete options[from];

  const filters = (options as CallbackOptionsWithFilters).filters ?? [];
  fromValue = new ActionFilter(filters, from, fromValue);

  const existing = options[to];
  const list: Array<((controller: AbstractController) => boolean) | CallbackPredicateLike> =
    existing === undefined ? [] : Array.isArray(existing) ? existing.slice() : [existing];
  list.unshift(fromValue);
  options[to] = list;
}

/** @internal */
export function _insertCallbacks(
  callbacks: Array<ActionCallback | AroundCallback>,
  options: CallbackOptions,
  block: ActionCallback | AroundCallback | null,
  yieldFn: (callback: ActionCallback | AroundCallback, options: CallbackOptions) => void,
): void {
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

/** @internal */
function _inspectFilter(filter: ActionCallback | AroundCallback): string {
  const fn = filter as { name?: string };
  return fn.name && fn.name.length > 0 ? `:${fn.name}` : "#<Proc:anonymous>";
}

/** @internal */
function _toConditionFns(pred: CallbackOptions["if"]): CallbackCondition[] | undefined {
  if (pred === undefined) return undefined;
  const list = Array.isArray(pred) ? pred : [pred];
  return list.map((item) =>
    typeof item === "function"
      ? (item as unknown as CallbackCondition)
      : (c: object) => item.isMatch(c as AbstractController),
  );
}

interface WrappedBefore {
  (target: object): Promise<unknown>;
  __originalCb: ActionCallback;
}

/** @internal */
function _wrapBefore(callback: ActionCallback): WrappedBefore {
  const wrapped = async (target: object): Promise<unknown> => {
    const result = await callback(target as AbstractController);
    if ((target as AbstractController).performed) throwAbort();
    return result;
  };
  (wrapped as WrappedBefore).__originalCb = callback;
  return wrapped as WrappedBefore;
}

/** @internal */
export function _defineActionCallbacks(prototype: object): void {
  asDefineCallbacks(prototype, PROCESS_ACTION_CHAIN, { skipAfterCallbacksIfTerminated: true });
}

/** @internal */
export function _registerActionCallback(
  prototype: object,
  kind: CallbackKind,
  callback: ActionCallback | AroundCallback,
  options: CallbackOptions,
): void {
  const opts: CallbackOptionsWithFilters = { ...options, filters: [callback] };
  _normalizeCallbackOptions(opts);
  delete opts.filters;

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
    filter as unknown as Parameters<typeof asSetCallback>[2],
    asOpts,
  );
}

/** @internal */
export function _skipActionCallback(
  prototype: object,
  kind: CallbackKind,
  filter: ActionCallback | AroundCallback | string,
  options: CallbackOptions,
): void {
  const namedFilter =
    typeof filter === "function" ? filter : ({ name: filter } as unknown as ActionCallback);
  const opts: CallbackOptionsWithFilters = { ...options, filters: [namedFilter] };
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
        { ifOption: ifConds, unlessOption: unlessConds },
      );
      if (stored !== undefined) {
        (merged.options as Record<string, unknown>)._trailsName = stored;
      }
      chain.insert(chain.index(cb), merged);
    }
    chain.delete(cb);
  }
}

export interface ActionCallbackHost {
  readonly prototype: object;
}

export function beforeAction(
  this: ActionCallbackHost,
  callback: ActionCallback,
  options: CallbackOptions = {},
): void {
  _registerActionCallback(this.prototype, "before", callback, options);
}

export function afterAction(
  this: ActionCallbackHost,
  callback: ActionCallback,
  options: CallbackOptions = {},
): void {
  _registerActionCallback(this.prototype, "after", callback, options);
}

export function aroundAction(
  this: ActionCallbackHost,
  callback: AroundCallback,
  options: CallbackOptions = {},
): void {
  _registerActionCallback(this.prototype, "around", callback, options);
}

export function skipBeforeAction(
  this: ActionCallbackHost,
  cb: ActionCallback | string,
  options: CallbackOptions = {},
): void {
  _skipActionCallback(this.prototype, "before", cb, options);
}

export function skipAfterAction(
  this: ActionCallbackHost,
  cb: ActionCallback | string,
  options: CallbackOptions = {},
): void {
  _skipActionCallback(this.prototype, "after", cb, options);
}

export function skipAroundAction(
  this: ActionCallbackHost,
  cb: AroundCallback | string,
  options: CallbackOptions = {},
): void {
  _skipActionCallback(this.prototype, "around", cb, options);
}

/** @internal */
export async function processAction(
  controller: AbstractController,
  _action: string,
  dispatch: () => Promise<void>,
): Promise<void> {
  await asRunCallbacks(controller, PROCESS_ACTION_CHAIN, dispatch);
}
