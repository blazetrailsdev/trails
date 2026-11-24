import { Enumerable } from "@blazetrails/ruby-compat/enumerable";
import { rbCallSuper } from "@blazetrails/ruby-compat/include";
import {
  extractOptionsBang,
  mattrAccessor,
  Callbacks as ASCallbacks,
  Concern,
  extend,
  include,
  type Extended,
  type Included,
} from "@blazetrails/activesupport";
import { ActionNotFound, type Base } from "./base.js";

export type ActionCallback<C = Base> = (controller: C) => void | boolean | Promise<void | boolean>;

export type AroundCallback<C = Base> = (
  controller: C,
  next: () => Promise<void>,
) => void | Promise<void>;

export interface CallbackPredicateLike {
  isMatch(controller: Base): boolean;
}

export interface CallbackOptions {
  only?: string | string[];
  except?: string | string[];
  if?:
    | `:${string}`
    | ((controller: Base) => boolean)
    | Array<`:${string}` | ((controller: Base) => boolean) | CallbackPredicateLike>;
  unless?:
    | `:${string}`
    | ((controller: Base) => boolean)
    | Array<`:${string}` | ((controller: Base) => boolean) | CallbackPredicateLike>;
  prepend?: boolean;
  raise?: boolean;
}

/** @internal */
type CallbackObject = {
  before?(controller: never): unknown;
  after?(controller: never): unknown;
  around?(controller: never, block: () => Promise<void>): unknown;
};

/** @internal */
type CallbackFilter<C = Base> = ActionCallback<C> | AroundCallback<C> | string | CallbackObject;

/** @internal */
type AnyCallbackFilter = CallbackFilter<never>;

/** @internal */
type CallbackOptionsWithFilters = CallbackOptions & {
  filters?: AnyCallbackFilter[];
};

/** @internal */
export class ActionFilter implements CallbackPredicateLike {
  private readonly _filters: ReadonlyArray<AnyCallbackFilter>;
  private readonly _conditionalKey: "only" | "except";
  private readonly _actions: ReadonlySet<string>;

  constructor(
    filters: ReadonlyArray<AnyCallbackFilter>,
    conditionalKey: "only" | "except",
    actions: string | string[],
  ) {
    this._filters = filters.slice();
    this._conditionalKey = conditionalKey;
    this._actions = new Set((Array.isArray(actions) ? actions : [actions]).map((a) => String(a)));
  }

  isMatch(controller: Base): boolean {
    const Constructor = controller.constructor as { raiseOnMissingCallbackActions?: boolean };
    if (Constructor.raiseOnMissingCallbackActions) {
      const missingAction = new Enumerable(this._actions).find(
        (action: string) => !controller.isAvailableAction(action),
      ) as string | null;
      if (missingAction != null) {
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
  after(controller: Base): boolean {
    return this.isMatch(controller);
  }
  /** @internal */
  before(controller: Base): boolean {
    return this.isMatch(controller);
  }
  /** @internal */
  around(controller: Base): boolean {
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
  const list: Array<`:${string}` | ((controller: Base) => boolean) | CallbackPredicateLike> =
    existing === undefined ? [] : Array.isArray(existing) ? existing.slice() : [existing];
  list.unshift(fromValue);
  options[to] = list;
}

/** @internal */
export function _insertCallbacks<C = Base>(
  callbacks: Array<CallbackFilter<C> | CallbackOptions>,
  block: ActionCallback<C> | AroundCallback<C> | null = null,
  yieldFn: (callback: CallbackFilter<C>, options: CallbackOptions) => void,
): void {
  const options = extractOptionsBang(callbacks) as CallbackOptionsWithFilters;
  const filters = callbacks as CallbackFilter<C>[];
  if (block) filters.push(block);
  options.filters = filters;
  _normalizeCallbackOptions(options);
  delete options.filters;
  for (const callback of filters) {
    yieldFn(callback, options);
  }
}

/** @internal */
function _inspectFilter(filter: AnyCallbackFilter): string {
  if (typeof filter === "string") return `:${filter}`;
  const fn = filter as { name?: string };
  return fn.name && fn.name.length > 0 ? `:${fn.name}` : "#<Proc:anonymous>";
}

type ActionCallbackArgs<T> = Array<T | string | CallbackObject | CallbackOptions>;

/** @internal */
type ControllerOf<H> = H extends abstract new (...args: never) => infer C ? C : Base;

export function beforeAction<
  H extends Pick<Extended<typeof ASCallbacks.ClassMethods>, "setCallback" | "skipCallback">,
>(this: H, ...names: ActionCallbackArgs<ActionCallback<ControllerOf<H>>>): void {
  const callback = "before";
  _insertCallbacks(names, null, (name, options) => {
    this.setCallback("process_action", callback, name, options);
  });
}

export function prependBeforeAction<
  H extends Pick<Extended<typeof ASCallbacks.ClassMethods>, "setCallback" | "skipCallback">,
>(this: H, ...names: ActionCallbackArgs<ActionCallback<ControllerOf<H>>>): void {
  const callback = "before";
  _insertCallbacks(names, null, (name, options) => {
    this.setCallback("process_action", callback, name, {
      ...options,
      prepend: true,
    });
  });
}

export function skipBeforeAction<
  H extends Pick<Extended<typeof ASCallbacks.ClassMethods>, "setCallback" | "skipCallback">,
>(this: H, ...names: ActionCallbackArgs<ActionCallback<ControllerOf<H>>>): void {
  const callback = "before";
  _insertCallbacks(names, null, (name, options) => {
    this.skipCallback("process_action", callback, name, options);
  });
}

export function afterAction<
  H extends Pick<Extended<typeof ASCallbacks.ClassMethods>, "setCallback" | "skipCallback">,
>(this: H, ...names: ActionCallbackArgs<ActionCallback<ControllerOf<H>>>): void {
  const callback = "after";
  _insertCallbacks(names, null, (name, options) => {
    this.setCallback("process_action", callback, name, options);
  });
}

export function prependAfterAction<
  H extends Pick<Extended<typeof ASCallbacks.ClassMethods>, "setCallback" | "skipCallback">,
>(this: H, ...names: ActionCallbackArgs<ActionCallback<ControllerOf<H>>>): void {
  const callback = "after";
  _insertCallbacks(names, null, (name, options) => {
    this.setCallback("process_action", callback, name, {
      ...options,
      prepend: true,
    });
  });
}

export function skipAfterAction<
  H extends Pick<Extended<typeof ASCallbacks.ClassMethods>, "setCallback" | "skipCallback">,
>(this: H, ...names: ActionCallbackArgs<ActionCallback<ControllerOf<H>>>): void {
  const callback = "after";
  _insertCallbacks(names, null, (name, options) => {
    this.skipCallback("process_action", callback, name, options);
  });
}

export function aroundAction<
  H extends Pick<Extended<typeof ASCallbacks.ClassMethods>, "setCallback" | "skipCallback">,
>(this: H, ...names: ActionCallbackArgs<AroundCallback<ControllerOf<H>>>): void {
  const callback = "around";
  _insertCallbacks(names, null, (name, options) => {
    this.setCallback("process_action", callback, name, options);
  });
}

export function prependAroundAction<
  H extends Pick<Extended<typeof ASCallbacks.ClassMethods>, "setCallback" | "skipCallback">,
>(this: H, ...names: ActionCallbackArgs<AroundCallback<ControllerOf<H>>>): void {
  const callback = "around";
  _insertCallbacks(names, null, (name, options) => {
    this.setCallback("process_action", callback, name, {
      ...options,
      prepend: true,
    });
  });
}

export function skipAroundAction<
  H extends Pick<Extended<typeof ASCallbacks.ClassMethods>, "setCallback" | "skipCallback">,
>(this: H, ...names: ActionCallbackArgs<AroundCallback<ControllerOf<H>>>): void {
  const callback = "around";
  _insertCallbacks(names, null, (name, options) => {
    this.skipCallback("process_action", callback, name, options);
  });
}

export const appendBeforeAction = beforeAction;
export const appendAfterAction = afterAction;
export const appendAroundAction = aroundAction;

export const ClassMethods = {
  _normalizeCallbackOptions,
  _normalizeCallbackOption,
  _insertCallbacks,
  beforeAction,
  prependBeforeAction,
  skipBeforeAction,
  appendBeforeAction,
  afterAction,
  prependAfterAction,
  skipAfterAction,
  appendAfterAction,
  aroundAction,
  prependAroundAction,
  skipAroundAction,
  appendAroundAction,
};

/** @internal */
export async function processAction(
  this: Base & Included<typeof ASCallbacks>,
  ...args: unknown[]
): Promise<unknown> {
  return this.runCallbacks("process_action", () => rbCallSuper(this, processAction, ...args));
}

type CallbacksIncludingClass = typeof Base & Extended<typeof ASCallbacks.ClassMethods>;

export const Callbacks = { ClassMethods, processAction };
extend(Callbacks, Concern);
include(Callbacks, ASCallbacks);
Concern.included.call(Callbacks, null, function (this: CallbacksIncludingClass) {
  this.defineCallbacks("process_action", {
    terminator: async (controller, resultLambda) => {
      await resultLambda();
      return (controller as Base).performed;
    },
    skipAfterCallbacksIfTerminated: true,
  });
  mattrAccessor.call(this, "raiseOnMissingCallbackActions", { default: false });
});
