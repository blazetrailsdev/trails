import {
  extractOptionsBang,
  defineCallbacks as asDefineCallbacks,
  setCallback as asSetCallback,
  skipCallback as asSkipCallback,
  runCallbacks as asRunCallbacks,
  type CallbackKind,
  type CallbackCondition,
  type CallbackOptions as ASCallbackOptions,
} from "@blazetrails/activesupport";
import { ActionNotFound, type AbstractController } from "./base.js";

export type ActionCallback = (
  controller: AbstractController,
) => void | boolean | Promise<void | boolean>;

export type AroundCallback = (
  controller: AbstractController,
  next: () => Promise<void>,
) => void | Promise<void>;

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
  raise?: boolean;
}

/** @internal */
type CallbackFilter = ActionCallback | AroundCallback | string;

/** @internal */
type CallbackOptionsWithFilters = CallbackOptions & {
  filters?: CallbackFilter[];
};

/** @internal */
export const PROCESS_ACTION_CHAIN = "processAction";

/** @internal */
export class ActionFilter implements CallbackPredicateLike {
  private readonly _filters: ReadonlyArray<CallbackFilter>;
  private readonly _conditionalKey: "only" | "except";
  private readonly _actions: ReadonlySet<string>;

  constructor(
    filters: ReadonlyArray<CallbackFilter>,
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
  callbacks: Array<CallbackFilter | CallbackOptions>,
  block: ActionCallback | AroundCallback | null = null,
  yieldFn: (callback: CallbackFilter, options: CallbackOptions) => void,
): void {
  const options = extractOptionsBang(callbacks) as CallbackOptionsWithFilters;
  const filters = callbacks as CallbackFilter[];
  if (block) filters.push(block);
  options.filters = filters;
  _normalizeCallbackOptions(options);
  delete options.filters;
  for (const callback of filters) {
    yieldFn(callback, options);
  }
}

/** @internal */
function _inspectFilter(filter: CallbackFilter): string {
  if (typeof filter === "string") return `:${filter}`;
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

/** @internal */
export function _defineActionCallbacks(prototype: object): void {
  asDefineCallbacks(prototype, PROCESS_ACTION_CHAIN, {
    terminator: async (controller, resultLambda) => {
      await resultLambda();
      return (controller as AbstractController).performed;
    },
    skipAfterCallbacksIfTerminated: true,
  });
}

/** @internal */
export function _registerActionCallback(
  prototype: object,
  kind: CallbackKind,
  callback: CallbackFilter,
  options: CallbackOptions,
): void {
  const asOpts: ASCallbackOptions = {};
  if (options.prepend) asOpts.prepend = true;
  const ifFns = _toConditionFns(options.if);
  const unlessFns = _toConditionFns(options.unless);
  if (ifFns) asOpts.if = ifFns;
  if (unlessFns) asOpts.unless = unlessFns;
  const filter = typeof callback === "string" ? `:${callback}` : callback;
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
  const asOpts: ASCallbackOptions & { raise?: boolean } = {};
  const ifFns = _toConditionFns(options.if);
  const unlessFns = _toConditionFns(options.unless);
  if (ifFns) asOpts.if = ifFns;
  if (unlessFns) asOpts.unless = unlessFns;
  if (options.raise !== undefined) asOpts.raise = options.raise;
  const name = typeof filter === "string" ? `:${filter}` : filter;
  asSkipCallback(
    prototype,
    PROCESS_ACTION_CHAIN,
    kind,
    name as unknown as Parameters<typeof asSkipCallback>[2],
    asOpts,
  );
}

export interface ActionCallbackHost {
  readonly prototype: object;
}

type ActionCallbackArgs<T> = Array<T | string | CallbackOptions>;

export function beforeAction(
  this: ActionCallbackHost,
  ...names: ActionCallbackArgs<ActionCallback>
): void {
  _insertCallbacks(names, null, (name, options) => {
    _registerActionCallback(this.prototype, "before", name, options);
  });
}

export function prependBeforeAction(
  this: ActionCallbackHost,
  ...names: ActionCallbackArgs<ActionCallback>
): void {
  _insertCallbacks(names, null, (name, options) => {
    _registerActionCallback(this.prototype, "before", name, { ...options, prepend: true });
  });
}

export function afterAction(
  this: ActionCallbackHost,
  ...names: ActionCallbackArgs<ActionCallback>
): void {
  _insertCallbacks(names, null, (name, options) => {
    _registerActionCallback(this.prototype, "after", name, options);
  });
}

export function prependAfterAction(
  this: ActionCallbackHost,
  ...names: ActionCallbackArgs<ActionCallback>
): void {
  _insertCallbacks(names, null, (name, options) => {
    _registerActionCallback(this.prototype, "after", name, { ...options, prepend: true });
  });
}

export function aroundAction(
  this: ActionCallbackHost,
  ...names: ActionCallbackArgs<AroundCallback>
): void {
  _insertCallbacks(names, null, (name, options) => {
    _registerActionCallback(this.prototype, "around", name, options);
  });
}

export function prependAroundAction(
  this: ActionCallbackHost,
  ...names: ActionCallbackArgs<AroundCallback>
): void {
  _insertCallbacks(names, null, (name, options) => {
    _registerActionCallback(this.prototype, "around", name, { ...options, prepend: true });
  });
}

export function skipBeforeAction(
  this: ActionCallbackHost,
  ...names: ActionCallbackArgs<ActionCallback>
): void {
  _insertCallbacks(names, null, (name, options) => {
    _skipActionCallback(this.prototype, "before", name, options);
  });
}

export function skipAfterAction(
  this: ActionCallbackHost,
  ...names: ActionCallbackArgs<ActionCallback>
): void {
  _insertCallbacks(names, null, (name, options) => {
    _skipActionCallback(this.prototype, "after", name, options);
  });
}

export function skipAroundAction(
  this: ActionCallbackHost,
  ...names: ActionCallbackArgs<AroundCallback>
): void {
  _insertCallbacks(names, null, (name, options) => {
    _skipActionCallback(this.prototype, "around", name, options);
  });
}

/** @internal */
export async function processAction(
  controller: AbstractController,
  _action: string,
  dispatch: () => Promise<void>,
): Promise<void> {
  await asRunCallbacks(controller, PROCESS_ACTION_CHAIN, dispatch);
}
