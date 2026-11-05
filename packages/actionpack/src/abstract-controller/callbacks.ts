import { Enumerable, rbCallSuper } from "@blazetrails/ruby-compat";
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

export type ActionCallback = (controller: Base) => void | boolean | Promise<void | boolean>;

export type AroundCallback = (controller: Base, next: () => Promise<void>) => void | Promise<void>;

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
type CallbackFilter = ActionCallback | AroundCallback | string | CallbackObject;

/** @internal */
type CallbackOptionsWithFilters = CallbackOptions & {
  filters?: CallbackFilter[];
};

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

type ActionCallbackArgs<T> = Array<T | string | CallbackObject | CallbackOptions>;

export function beforeAction(
  this: Extended<typeof ASCallbacks.ClassMethods>,
  ...names: ActionCallbackArgs<ActionCallback>
): void {
  const callback = "before";
  _insertCallbacks(names, null, (name, options) => {
    this.setCallback("process_action", callback, name, options);
  });
}

export function prependBeforeAction(
  this: Extended<typeof ASCallbacks.ClassMethods>,
  ...names: ActionCallbackArgs<ActionCallback>
): void {
  const callback = "before";
  _insertCallbacks(names, null, (name, options) => {
    this.setCallback("process_action", callback, name, {
      ...options,
      prepend: true,
    });
  });
}

export function skipBeforeAction(
  this: Extended<typeof ASCallbacks.ClassMethods>,
  ...names: ActionCallbackArgs<ActionCallback>
): void {
  const callback = "before";
  _insertCallbacks(names, null, (name, options) => {
    this.skipCallback("process_action", callback, name, options);
  });
}

export function afterAction(
  this: Extended<typeof ASCallbacks.ClassMethods>,
  ...names: ActionCallbackArgs<ActionCallback>
): void {
  const callback = "after";
  _insertCallbacks(names, null, (name, options) => {
    this.setCallback("process_action", callback, name, options);
  });
}

export function prependAfterAction(
  this: Extended<typeof ASCallbacks.ClassMethods>,
  ...names: ActionCallbackArgs<ActionCallback>
): void {
  const callback = "after";
  _insertCallbacks(names, null, (name, options) => {
    this.setCallback("process_action", callback, name, {
      ...options,
      prepend: true,
    });
  });
}

export function skipAfterAction(
  this: Extended<typeof ASCallbacks.ClassMethods>,
  ...names: ActionCallbackArgs<ActionCallback>
): void {
  const callback = "after";
  _insertCallbacks(names, null, (name, options) => {
    this.skipCallback("process_action", callback, name, options);
  });
}

export function aroundAction(
  this: Extended<typeof ASCallbacks.ClassMethods>,
  ...names: ActionCallbackArgs<AroundCallback>
): void {
  const callback = "around";
  _insertCallbacks(names, null, (name, options) => {
    this.setCallback("process_action", callback, name, options);
  });
}

export function prependAroundAction(
  this: Extended<typeof ASCallbacks.ClassMethods>,
  ...names: ActionCallbackArgs<AroundCallback>
): void {
  const callback = "around";
  _insertCallbacks(names, null, (name, options) => {
    this.setCallback("process_action", callback, name, {
      ...options,
      prepend: true,
    });
  });
}

export function skipAroundAction(
  this: Extended<typeof ASCallbacks.ClassMethods>,
  ...names: ActionCallbackArgs<AroundCallback>
): void {
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
(
  Callbacks as unknown as {
    included(base: null, block: (this: CallbacksIncludingClass) => void): void;
  }
).included(null, function (this: CallbacksIncludingClass) {
  this.defineCallbacks("process_action", {
    terminator: async (controller, resultLambda) => {
      await resultLambda();
      return (controller as Base).performed;
    },
    skipAfterCallbacksIfTerminated: true,
  });
  mattrAccessor.call(this, "raiseOnMissingCallbackActions", { default: false });
});
