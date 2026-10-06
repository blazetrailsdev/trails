import {
  type Callbacks as ASCallbacks,
  Configurable,
  include,
  underscore,
  type Extended,
} from "@blazetrails/activesupport";
import { SpellChecker } from "@blazetrails/did-you-mean";
import { rbFSend, rbModName, rbObjId, sprintf } from "@blazetrails/ruby-compat";

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
  afterAction,
  appendAfterAction,
  appendAroundAction,
  appendBeforeAction,
  aroundAction,
  beforeAction,
  prependAfterAction,
  prependAroundAction,
  prependBeforeAction,
  skipAfterAction,
  skipAroundAction,
  skipBeforeAction,
  Callbacks,
  _insertCallbacks,
  _normalizeCallbackOption,
  _normalizeCallbackOptions,
  processAction as _runProcessActionCallbacks,
} from "./callbacks.js";
export type {
  ActionCallback,
  AroundCallback,
  CallbackOptions,
  CallbackPredicateLike,
} from "./callbacks.js";

export class ActionNotFound extends Error {
  readonly controller: AbstractController | null;
  readonly action: string | null;

  constructor(
    message: string,
    controller: AbstractController | null = null,
    action: string | null = null,
  ) {
    super(message);
    this.name = "AbstractController::ActionNotFound";
    this.controller = controller;
    this.action = action;
  }

  #cachedCorrections?: string[];

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
  declare static defineCallbacks: Extended<typeof ASCallbacks.ClassMethods>["defineCallbacks"];
  declare static setCallback: Extended<typeof ASCallbacks.ClassMethods>["setCallback"];
  declare static skipCallback: Extended<typeof ASCallbacks.ClassMethods>["skipCallback"];

  _actionName: string = "";

  get actionName(): string {
    return this._actionName;
  }
  set actionName(value: string) {
    this._actionName = value;
  }

  declare static raiseOnMissingCallbackActions: boolean;

  protected _responseBody: string | Buffer | null = null;

  get responseBody(): string | Buffer | null {
    return this._responseBody;
  }
  set responseBody(value: string | Buffer | null) {
    this._responseBody = value;
  }

  protected _performed: boolean = false;

  private static readonly _internalMethods: ReadonlySet<string> = new Set([
    "constructor",
    "processAction",
    "actionMissing",
    "dispatch",
    "head",
    "setHeader",
    "getHeader",
    "toA",
    "render",
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

  private static _actionMethodCache?: Map<string, string>;

  protected static _abstract: boolean = false;

  /** @internal */
  static get abstract(): boolean {
    return Object.prototype.hasOwnProperty.call(this, "_abstract")
      ? (this as unknown as { _abstract: boolean })._abstract
      : false;
  }

  /** @internal */
  static isAbstract(): boolean {
    return this.abstract;
  }

  /** @internal */
  static abstractBang(): void {
    (this as unknown as { _abstract: boolean })._abstract = true;
  }

  static {
    this.abstractBang();
  }

  /** @internal */
  protected static _controllerPath?: string;

  static controllerPath(): string {
    if (Object.prototype.hasOwnProperty.call(this, "_controllerPath")) {
      return (this as unknown as { _controllerPath: string })._controllerPath;
    }
    const name = rbModName(this);
    if (!name) return ((this as unknown as { _controllerPath: string })._controllerPath = "");
    const SUFFIX = "Controller";
    const stripped = name.endsWith(SUFFIX) ? name.slice(0, -SUFFIX.length) : name;
    return ((this as unknown as { _controllerPath: string })._controllerPath =
      underscore(stripped));
  }

  /** @internal */
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

  /** @internal */
  static clearActionMethodsBang(): void {
    (this as unknown as { _actionMethodCache?: Map<string, string> })._actionMethodCache =
      undefined;
  }

  /** @internal */
  static methodAdded(_name: string): void {
    this.clearActionMethodsBang();
  }

  /** @internal */
  static eagerLoadBang(): void {
    this.actionMethods();
  }

  static actionMethods(): string[] {
    if (
      !Object.prototype.hasOwnProperty.call(this, "_actionMethodCache") ||
      !this._actionMethodCache
    ) {
      const internalMethods = new Set(this.internalMethods());
      const methods = allPublicMethodNames(this.prototype).filter(
        (name) => !internalMethods.has(name),
      );
      methods.push(...ownPublicMethodNames(this.prototype));
      this._actionMethodCache = new Map(methods.map((name) => [underscore(name), name]));
    }
    return [...this._actionMethodCache.keys()];
  }

  /** @internal */
  static _normalizeCallbackOptions = _normalizeCallbackOptions;
  /** @internal */
  static _normalizeCallbackOption = _normalizeCallbackOption;
  /** @internal */
  static _insertCallbacks = _insertCallbacks;

  static beforeAction = beforeAction;
  static prependBeforeAction = prependBeforeAction;
  static appendBeforeAction = appendBeforeAction;
  static afterAction = afterAction;
  static prependAfterAction = prependAfterAction;
  static appendAfterAction = appendAfterAction;
  static aroundAction = aroundAction;
  static prependAroundAction = prependAroundAction;
  static appendAroundAction = appendAroundAction;
  static skipBeforeAction = skipBeforeAction;
  static skipAfterAction = skipAfterAction;
  static skipAroundAction = skipAroundAction;

  /** @internal */
  async processAction(action: string, ...args: unknown[]): Promise<void> {
    this._performed = false;
    await _runProcessActionCallbacks(this, action, async () => {
      await this.sendAction(action, ...args);
    });
  }

  /** @internal */
  sendAction(method: string, ...args: unknown[]): unknown {
    return rbFSend(this, method, ...args);
  }

  async process(action: string, ...args: unknown[]): Promise<void> {
    this._actionName = String(action);

    const actionName = this._findActionName(this._actionName);
    if (!actionName) {
      throw new ActionNotFound(
        `The action '${action}' could not be found for ${this.constructor.name}`,
        this,
        action,
      );
    }

    this._responseBody = null;

    await this.processAction(actionName, ...args);
  }

  controllerPath(): string {
    return (this.constructor as typeof AbstractController).controllerPath();
  }

  actionMethods(): string[] {
    return (this.constructor as typeof AbstractController).actionMethods();
  }

  isAvailableAction(actionName: string): boolean {
    return this._findActionName(actionName) !== undefined;
  }

  inspect(): string {
    return `#<${this.constructor.name}:${sprintf("%#016x", rbObjId(this) << 1)}>`;
  }

  /** @internal */
  isActionMethod(name: string): boolean {
    const cls = this.constructor as typeof AbstractController;
    cls.actionMethods();
    return cls._actionMethodCache!.has(name);
  }

  /** @internal */
  _handleActionMissing(...args: unknown[]): unknown {
    return (this as any).actionMissing?.(this.actionName, ...args);
  }

  /** @internal */
  _findActionName(actionName: string): string | undefined {
    return this._validActionName(actionName) ? this.methodForAction(actionName) : undefined;
  }

  /** @internal */
  methodForAction(actionName: string): string | undefined {
    if (this.isActionMethod(actionName)) {
      return (this.constructor as typeof AbstractController)._actionMethodCache!.get(actionName);
    }
    if (typeof (this as any).actionMissing === "function") return "_handleActionMissing";
    return undefined;
  }

  /** @internal */
  _validActionName(actionName: string): boolean {
    return !actionName.includes("/");
  }

  static supportsPath(): boolean {
    return true;
  }

  get performed(): boolean {
    return this._performed || this._responseBody !== null;
  }

  protected markPerformed(): void {
    this._performed = true;
  }
}

include(AbstractController, Configurable);

include(AbstractController, Callbacks);
