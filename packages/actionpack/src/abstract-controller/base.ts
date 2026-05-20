/**
 * AbstractController::Base
 *
 * Foundation for all controllers. Provides action dispatching,
 * callbacks, and format collection.
 * @see https://api.rubyonrails.org/classes/AbstractController/Base.html
 */

import { underscore } from "@blazetrails/activesupport";
import { SpellChecker } from "@blazetrails/did-you-mean";

function ownPublicMethodNames(proto: object | null | undefined): string[] {
  if (!proto) return [];
  const out: string[] = [];
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === "constructor" || name.startsWith("_")) continue;
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (d && typeof d.value === "function") out.push(name);
  }
  return out;
}

function allPublicMethodNames(proto: object | null | undefined): string[] {
  const out = new Set<string>();
  let cur: object | null = proto ?? null;
  while (cur && cur !== Object.prototype) {
    for (const name of ownPublicMethodNames(cur)) out.add(name);
    cur = Object.getPrototypeOf(cur);
  }
  return [...out];
}

import {
  _defineActionCallbacks,
  _insertCallbacks,
  _normalizeCallbackOption,
  _normalizeCallbackOptions,
  _registerActionCallback,
  _skipActionCallback,
  processAction as _runProcessActionCallbacks,
  type ActionCallback,
  type AroundCallback,
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

  #cachedCorrections?: string[];

  /**
   * Mirrors Ruby's `DidYouMean::Correctable#corrections` (memoised via
   * `@corrections ||= ...` in Rails). Suggests action methods on the
   * raising controller close to the missing action name. Empty when
   * the error was constructed without a controller/action context.
   */
  get corrections(): string[] {
    if (this.#cachedCorrections !== undefined) return this.#cachedCorrections;
    if (!this.controller || !this.action) {
      this.#cachedCorrections = [];
      return this.#cachedCorrections;
    }
    const ctor = this.controller.constructor as typeof AbstractController;
    this.#cachedCorrections = new SpellChecker({
      dictionary: ctor.actionMethods(),
    }).correct(this.action);
    return this.#cachedCorrections;
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

  /** Rails `attr_reader :abstract` — class-level abstract flag. Defaults
   * to `false`; flipped via `abstractBang()`. */
  protected static _abstract: boolean = false;

  /** Rails `class << self; attr_reader :abstract`. @internal */
  static get abstract(): boolean {
    return Object.prototype.hasOwnProperty.call(this, "_abstract")
      ? (this as unknown as { _abstract: boolean })._abstract
      : false;
  }

  /** Rails `abstract?` predicate; aliases `abstract`. @internal */
  static isAbstract(): boolean {
    return this.abstract;
  }

  /** Rails `abstract!` — marks this class as abstract. @internal */
  static abstractBang(): void {
    (this as unknown as { _abstract: boolean })._abstract = true;
  }

  /** Cached controller_path memo (per-class own property). @internal */
  protected static _controllerPath?: string;

  /**
   * Rails `controller_path` — the controller's underscored name with
   * the `Controller` suffix stripped (`MyApp::MyPostsController` →
   * `"my_app/my_posts"`). Returns the empty string for anonymous classes.
   */
  static controllerPath(): string {
    if (Object.prototype.hasOwnProperty.call(this, "_controllerPath")) {
      return (this as unknown as { _controllerPath: string })._controllerPath;
    }
    const name = this.name;
    if (!name) return ((this as unknown as { _controllerPath: string })._controllerPath = "");
    const SUFFIX = "Controller";
    const stripped = name.endsWith(SUFFIX) ? name.slice(0, -SUFFIX.length) : name;
    return ((this as unknown as { _controllerPath: string })._controllerPath =
      underscore(stripped));
  }

  /**
   * Rails `internal_methods` — walks the superclass chain up to the
   * first abstract ancestor, collecting non-abstract subclasses' own
   * public instance methods, then returns the abstract ancestor's full
   * public method set minus those collected. Combined with the
   * curated `_internalMethods` constant so wired-up entry points
   * (`processAction`, `render`, …) are always treated as internal even
   * before the class chain marks them.
   * @internal
   */
  static internalMethods(): string[] {
    const collected = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let cursor: typeof AbstractController = this;
    while (cursor && !cursor.isAbstract()) {
      for (const name of ownPublicMethodNames(cursor.prototype)) collected.add(name);
      const next = Object.getPrototypeOf(cursor);
      if (!next || next === Function.prototype) break;
      cursor = next as typeof AbstractController;
    }
    const abstractProto = cursor?.prototype ?? AbstractController.prototype;
    const all = new Set<string>(allPublicMethodNames(abstractProto));
    for (const name of collected) all.delete(name);
    for (const name of AbstractController._internalMethods) all.add(name);
    return [...all];
  }

  /** Rails `clear_action_methods!` — invalidate the cached action set. @internal */
  static clearActionMethodsBang(): void {
    (this as unknown as { _actionMethodCache?: Set<string> })._actionMethodCache = undefined;
  }

  /**
   * Rails `method_added(name)` hook — invalidates the action-method
   * cache when a new method is defined on the controller. JS has no
   * `method_added` hook; callers (e.g. helpers wiring that defines
   * methods at runtime) must invoke this explicitly. @internal
   */
  static methodAdded(_name: string): void {
    this.clearActionMethodsBang();
  }

  /** Rails `eager_load!` — warm the action-method cache. @internal */
  static eagerLoadBang(): void {
    this.actionMethods();
  }

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
    _registerActionCallback(this.prototype, "before", callback, options);
  }

  /** Register an after_action callback. */
  static afterAction(callback: ActionCallback, options: CallbackOptions = {}): void {
    _registerActionCallback(this.prototype, "after", callback, options);
  }

  /** Register an around_action callback. */
  static aroundAction(callback: AroundCallback, options: CallbackOptions = {}): void {
    _registerActionCallback(this.prototype, "around", callback, options);
  }

  /** Skip a registered before_action. Accepts the callback reference or
   * (for callbacks registered with `name`) the name string. Conditional
   * options (`if`/`unless`/`only`/`except`) merge via Rails skip semantics. */
  static skipBeforeAction(cb: ActionCallback | string, options: CallbackOptions = {}): void {
    _skipActionCallback(this.prototype, "before", cb, options);
  }

  /** Skip a registered after_action. */
  static skipAfterAction(cb: ActionCallback | string, options: CallbackOptions = {}): void {
    _skipActionCallback(this.prototype, "after", cb, options);
  }

  /** Skip a registered around_action. */
  static skipAroundAction(cb: AroundCallback | string, options: CallbackOptions = {}): void {
    _skipActionCallback(this.prototype, "around", cb, options);
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
}

// Provision the `processAction` AS::Callbacks chain on the root prototype;
// all subclasses inherit through prototype-chain COW in AS::Callbacks.
_defineActionCallbacks(AbstractController.prototype);
