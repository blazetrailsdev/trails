/**
 * AbstractController::Base
 *
 * Foundation for all controllers. Provides action dispatching,
 * callbacks, and format collection.
 * @see https://api.rubyonrails.org/classes/AbstractController/Base.html
 */

import {
  _insertCallbacks,
  _normalizeCallbackOption,
  _normalizeCallbackOptions,
  processAction as _runProcessActionCallbacks,
  type ActionCallback,
  type AroundCallback,
  type CallbackEntry,
  type CallbackOptions,
} from "./callbacks.js";
export type {
  ActionCallback,
  AroundCallback,
  CallbackOptions,
  CallbackPredicateLike,
} from "./callbacks.js";

/** Raised when an action cannot be found for the given controller. */
export class ActionNotFound extends Error {
  readonly controller: AbstractController | null;
  readonly action: string | null;

  constructor(
    message: string,
    controller: AbstractController | null = null,
    action: string | null = null,
  ) {
    super(message);
    this.name = "ActionNotFound";
    this.controller = controller;
    this.action = action;
  }
}

export class AbstractController {
  /** The action currently being processed. */
  actionName: string = "";

  /** When true, ActionFilter#isMatch raises if `:only`/`:except` references
   * an action that doesn't exist on the controller. Rails 7.1 mattr_accessor. */
  static raiseOnMissingCallbackActions: boolean = false;

  /** Internal storage for response body. Subclasses may override the
   * `responseBody` accessor (e.g. Metal writes through to the response). */
  protected _responseBody: string | Buffer | null = null;

  /** Response body. */
  get responseBody(): string | Buffer | null {
    return this._responseBody;
  }
  set responseBody(value: string | Buffer | null) {
    this._responseBody = value;
  }

  /** Whether a response has been committed (render/redirect called). */
  protected _performed: boolean = false;

  /** Registered callbacks (class-level, inherited). */
  private static _callbacks: CallbackEntry[] = [];

  /** Skipped callback identifiers. */
  private static _skippedCallbacks: Array<{
    callback: ActionCallback | AroundCallback;
    options: CallbackOptions;
  }> = [];

  private static readonly _internalMethods: ReadonlySet<string> = new Set([
    "constructor",
    "processAction",
    "availableActions",
    "actionMissing",
    "dispatch",
    "head",
    "setHeader",
    "getHeader",
    "toRackResponse",
    "render",
    "renderAsync",
    "renderToString",
    "redirectTo",
    "redirectBack",
    "respondTo",
    "freshWhen",
    "stale",
    "expiresIn",
    "expiresNow",
    "sendFile",
    "sendData",
    "verifyAuthenticityToken",
    "formAuthenticityToken",
    "markPerformed",
    "inspect",
    "controllerPath",
    "controllerName",
    "isContentSecurityPolicy",
    "contentSecurityPolicyNonce",
    "currentContentSecurityPolicy",
    "rateLimiting",
  ]);

  private static _actionMethodCache?: Set<string>;

  /** Returns the set of public action methods defined on this controller. */
  static actionMethods(): string[] {
    if (
      !Object.prototype.hasOwnProperty.call(this, "_actionMethodCache") ||
      !this._actionMethodCache
    ) {
      const internal = AbstractController._internalMethods;
      const methods: string[] = [];
      let current: object | null = this.prototype;
      while (current && current !== AbstractController.prototype && current !== Object.prototype) {
        for (const name of Object.getOwnPropertyNames(current)) {
          if (name.startsWith("_") || internal.has(name)) continue;
          const descriptor = Object.getOwnPropertyDescriptor(current, name);
          if (descriptor && typeof descriptor.value === "function") {
            methods.push(name);
          }
        }
        current = Object.getPrototypeOf(current);
      }
      this._actionMethodCache = new Set(methods);
    }
    return [...this._actionMethodCache];
  }

  /** Check if an action exists. */
  static hasAction(action: string): boolean {
    if (
      !Object.prototype.hasOwnProperty.call(this, "_actionMethodCache") ||
      !this._actionMethodCache
    ) {
      this.actionMethods();
    }
    return this._actionMethodCache!.has(action);
  }

  /** @internal Rails-private callback option normalizer. */
  static _normalizeCallbackOptions = _normalizeCallbackOptions;
  /** @internal Rails-private single-key callback option normalizer. */
  static _normalizeCallbackOption = _normalizeCallbackOption;
  /** @internal Rails-private callback insertion helper. */
  static _insertCallbacks = _insertCallbacks;

  /** Register a before_action callback. */
  static beforeAction(callback: ActionCallback, options: CallbackOptions = {}): void {
    this._registerActionCallback("before", callback, options);
  }

  /** Register an after_action callback. */
  static afterAction(callback: ActionCallback, options: CallbackOptions = {}): void {
    this._registerActionCallback("after", callback, options);
  }

  /** Register an around_action callback. */
  static aroundAction(callback: AroundCallback, options: CallbackOptions = {}): void {
    this._registerActionCallback("around", callback, options);
  }

  /** Pre-populates `options.filters` so ActionFilter retains the callback
   * for diagnostic rendering. Mirrors `_insert_callbacks` filters wiring. @internal */
  private static _registerActionCallback(
    type: "before" | "after" | "around",
    callback: ActionCallback | AroundCallback,
    options: CallbackOptions,
  ): void {
    const opts = options as CallbackOptions & {
      filters?: Array<ActionCallback | AroundCallback>;
    };
    opts.filters = [callback];
    _normalizeCallbackOptions(options);
    delete opts.filters;
    const entry: CallbackEntry = { callback, type, options };
    if (options.prepend) {
      this._ensureOwnCallbacks().unshift(entry);
    } else {
      this._ensureOwnCallbacks().push(entry);
    }
  }

  /** Skip a previously registered before_action. */
  static skipBeforeAction(callback: ActionCallback, options: CallbackOptions = {}): void {
    this._ensureOwnSkipped().push({ callback, options });
  }

  /** Get all callbacks including inherited ones. */
  static getCallbacks(): CallbackEntry[] {
    const chain: CallbackEntry[] = [];
    const hierarchy = this._getHierarchy();
    for (const klass of hierarchy) {
      if (Object.prototype.hasOwnProperty.call(klass, "_callbacks")) {
        chain.push(...(klass as any)._callbacks);
      }
    }
    // Dedup by (`options.name`, `type`): when a subclass registers a
    // callback with the same name and kind, drop the inherited entry.
    // Mirrors AS::Callbacks CallbackChain#remove_duplicates, which
    // matches on Callback#duplicates? (same filter + same kind) — so
    // `before_action :first` and `after_action :first` coexist, but a
    // child's `before_action :first, except: :index` replaces the
    // parent's `before_action :first`.
    const seen = new Set<string>();
    for (let i = chain.length - 1; i >= 0; i--) {
      const entry = chain[i]!;
      if (entry.options.name === undefined) continue;
      const key = `${entry.type}\0${entry.options.name}`;
      if (seen.has(key)) {
        chain.splice(i, 1);
      } else {
        seen.add(key);
      }
    }
    return chain;
  }

  /** Get all skipped callbacks. */
  static getSkipped(): Array<{
    callback: ActionCallback | AroundCallback;
    options: CallbackOptions;
  }> {
    const skipped: Array<{ callback: ActionCallback | AroundCallback; options: CallbackOptions }> =
      [];
    const hierarchy = this._getHierarchy();
    for (const klass of hierarchy) {
      if (Object.prototype.hasOwnProperty.call(klass, "_skippedCallbacks")) {
        skipped.push(...(klass as any)._skippedCallbacks);
      }
    }
    return skipped;
  }

  /**
   * Process an action by name. Delegates to the callbacks-wrapping
   * dispatcher in `callbacks.ts`, which then invokes `_dispatchAction` as
   * the inner step (mirrors Rails AC::Callbacks#process_action overriding
   * Base#process_action with a `run_callbacks { super }` wrapper).
   */
  async processAction(action: string, ...args: unknown[]): Promise<void> {
    this.actionName = action;
    this._performed = false;
    await _runProcessActionCallbacks(this, action, () => this._dispatchAction(action, ...args));
  }

  /** Rails `Base#send_action` — raw method dispatch with actionMissing
   * fallback and ActionNotFound on no match. @internal */
  async _dispatchAction(action: string, ...args: unknown[]): Promise<void> {
    const Constructor = this.constructor as typeof AbstractController;
    if (Constructor.hasAction(action)) {
      const method = (this as any)[action];
      if (typeof method === "function") {
        await method.apply(this, args);
      }
    } else if (typeof (this as any).actionMissing === "function") {
      await (this as any).actionMissing(action, ...args);
    } else {
      throw new ActionNotFound(
        `The action '${action}' could not be found for ${this.constructor.name}`,
        this,
        action,
      );
    }
  }

  /**
   * Rails `Base#process` — public entry. Validates the action via
   * `_findActionName`, resets the response body, then delegates to
   * `processAction` which handles the per-request `actionName` /
   * `_performed` setup. Splitting state ownership this way (Rails-style
   * single-setter is the goal, but trails has long-standing direct
   * `processAction` callers in Metal and tests that need their state
   * primed) avoids the double-assign that earlier iterations had.
   */
  async process(action: string, ...args: unknown[]): Promise<void> {
    if (!this._findActionName(action)) {
      throw new ActionNotFound(
        `The action '${action}' could not be found for ${this.constructor.name}`,
        this,
        action,
      );
    }
    this._responseBody = null;
    await this.processAction(action, ...args);
  }

  /** Rails `available_action?` — `action` is a real method or covered by
   * `actionMissing`. */
  isAvailableAction(action: string): boolean {
    return this._findActionName(action) !== undefined;
  }

  /** @internal */
  isActionMethod(name: string): boolean {
    return (this.constructor as typeof AbstractController).hasAction(name);
  }

  /** @internal */
  _handleActionMissing(...args: unknown[]): unknown {
    return (this as any).actionMissing?.(this.actionName, ...args);
  }

  /** @internal */
  _findActionName(name: string): string | undefined {
    return this._validActionName(name) ? this.methodForAction(name) : undefined;
  }

  /** @internal */
  methodForAction(name: string): string | undefined {
    if (this.isActionMethod(name)) return name;
    if (typeof (this as any).actionMissing === "function") return "_handleActionMissing";
    return undefined;
  }

  /** @internal Rails `_valid_action_name?` — reject path-separator names. */
  _validActionName(name: string): boolean {
    return !name.includes("/");
  }

  /** Rails `Base.supports_path?` — whether this controller renders URL paths. */
  static supportsPath(): boolean {
    return true;
  }

  /**
   * Whether a render or redirect has been performed. Mirrors Rails'
   * `AbstractController::Base#performed?` which is defined as
   * `response_body` — i.e. truthy iff the response body has been
   * assigned. The `_performed` flag is also honored so internal helpers
   * (e.g. `head`) can mark performed without assigning a body.
   */
  get performed(): boolean {
    return this._performed || this._responseBody !== null;
  }

  /** Mark the response as performed. */
  protected markPerformed(): void {
    this._performed = true;
  }

  /** Get available action names. */
  availableActions(): string[] {
    return (this.constructor as typeof AbstractController).actionMethods();
  }

  private static _ensureOwnCallbacks(): CallbackEntry[] {
    if (!Object.prototype.hasOwnProperty.call(this, "_callbacks")) {
      (this as any)._callbacks = [];
    }
    return (this as any)._callbacks;
  }

  private static _ensureOwnSkipped(): Array<{
    callback: ActionCallback | AroundCallback;
    options: CallbackOptions;
  }> {
    if (!Object.prototype.hasOwnProperty.call(this, "_skippedCallbacks")) {
      (this as any)._skippedCallbacks = [];
    }
    return (this as any)._skippedCallbacks;
  }

  private static _getHierarchy(): Array<typeof AbstractController> {
    const chain: Array<typeof AbstractController> = [];
    let klass = this as typeof AbstractController;
    while (klass && klass !== (Object as unknown)) {
      chain.unshift(klass);
      klass = Object.getPrototypeOf(klass);
    }
    return chain;
  }
}
