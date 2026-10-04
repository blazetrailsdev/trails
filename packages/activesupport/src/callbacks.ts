import {
  extend,
  kernelCatch,
  Module,
  NoMethodError,
  rbBlockGivenP,
  rbClassSuperclass,
  rbModSingletonP,
  RuntimeError,
} from "@blazetrails/ruby-compat";

import { kernelArray } from "./array-utils.js";
import { classAttribute } from "./class-attribute.js";
import { Concern } from "./concern.js";
import { ArgumentError, extractOptionsBang } from "./hash-utils.js";
import { DescendantsTracker, type AnyClass } from "./descendants-tracker.js";
import { camelize } from "./inflector.js";

export type CallbackKind = "before" | "after" | "around";

export type CallbackCondition<T extends object = object> =
  | ((target: T, value?: unknown) => boolean)
  | Value
  | string;

export interface CallbackOptions<T extends object = object> {
  if?: CallbackCondition<T> | CallbackCondition<T>[];
  unless?: CallbackCondition<T> | CallbackCondition<T>[];
  prepend?: boolean;
  raise?: boolean;
}

export interface DefineCallbacksOptions<T extends object = object> {
  terminator?: ((target: T, fn: () => unknown) => boolean | Promise<boolean>) | false;
  skipAfterCallbacksIfTerminated?: boolean;
  scope?: string[];
}

export type BeforeCallback<T extends object = object> = (target: T) => unknown;

export type AfterCallback<T extends object = object> = (target: T) => unknown;

export type AroundCallback<T extends object = object> = (
  target: T,
  next: () => void | Promise<void>,
) => void | Promise<void>;
export type AnyCallback<T extends object = object> =
  | BeforeCallback<T>
  | AfterCallback<T>
  | AroundCallback<T>;

export type CallbackObject = object;

export interface RunCallbacksOptions {
  strict?: "sync";
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    v !== null &&
    (typeof v === "object" || typeof v === "function") &&
    typeof (v as { then?: unknown }).then === "function"
  );
}

function swallowRejection(v: unknown): void {
  if (isThenable(v)) void Promise.resolve(v).catch(() => {});
}

export class Value {
  private readonly block: (value: unknown) => unknown;

  constructor(block: (value: unknown) => unknown) {
    this.block = block;
  }

  call(_target: object, value: unknown): unknown {
    return this.block(value);
  }

  static check(callback: Callback, target: object, value?: unknown): boolean {
    return callback.conditionsLambdas().every((cond) => cond(target, value));
  }
}

export interface CallTemplate {
  expand(target: object, value: unknown, block: (() => unknown) | null): unknown[];
  makeLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => unknown;
  invertedLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => boolean;
}

export class MethodCall implements CallTemplate {
  constructor(readonly methodName: PropertyKey) {}

  expand(target: object, _value: unknown, block: (() => unknown) | null): unknown[] {
    return [target, block, this.methodName];
  }

  private send(target: object, block?: (() => unknown) | null): unknown {
    const method = (target as Record<PropertyKey, unknown>)[this.methodName];
    if (typeof method !== "function") {
      throw new NoMethodError(
        `undefined method '${String(this.methodName)}' for an instance of ${target.constructor.name}`,
      );
    }
    return (method as (this: object, block?: (() => unknown) | null) => unknown).call(
      target,
      block,
    );
  }

  makeLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => unknown {
    return (target: object, _value: unknown, block?: (() => unknown) | null) =>
      this.send(target, block);
  }

  invertedLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => boolean {
    return (target: object, _value: unknown, block?: (() => unknown) | null) =>
      !this.send(target, block);
  }
}

export class ObjectCall implements CallTemplate {
  constructor(
    readonly target: object | null,
    readonly methodName: string,
  ) {}

  expand(target: object, _value: unknown, block: (() => unknown) | null): unknown[] {
    return [this.target ?? target, block, this.methodName, target];
  }

  private send(
    receiver: Record<string, unknown>,
    target: object,
    block?: (() => unknown) | null,
  ): unknown {
    const method = receiver[this.methodName];
    if (typeof method !== "function") {
      throw new NoMethodError(
        `undefined method '${this.methodName}' for an instance of ${receiver.constructor.name}`,
      );
    }
    return (method as (this: unknown, arg: object, block?: (() => unknown) | null) => unknown).call(
      receiver,
      target,
      block,
    );
  }

  makeLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => unknown {
    const ot = this.target;
    return (target: object, _value: unknown, block?: (() => unknown) | null) =>
      this.send((ot ?? target) as Record<string, unknown>, target, block);
  }

  invertedLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => boolean {
    const ot = this.target;
    return (target: object, _value: unknown, block?: (() => unknown) | null) =>
      !this.send((ot ?? target) as Record<string, unknown>, target, block);
  }
}

export class InstanceExec0 implements CallTemplate {
  constructor(readonly fn: () => unknown) {}

  expand(target: object, _value: unknown, block: (() => unknown) | null): unknown[] {
    return [target, this.fn, "instanceExec"];
  }

  makeLambda(): (target: object, value: unknown) => unknown {
    const f = this.fn;
    return (target: object) => f.call(target);
  }

  invertedLambda(): (target: object, value: unknown) => boolean {
    const f = this.fn;
    return (target: object) => !f.call(target);
  }
}

export class InstanceExec1 implements CallTemplate {
  constructor(readonly fn: (target: object) => unknown) {}

  expand(target: object, _value: unknown, block: (() => unknown) | null): unknown[] {
    return [target, this.fn, "instanceExec", target];
  }

  makeLambda(): (target: object, value: unknown) => unknown {
    const f = this.fn;
    return (target: object) => f.call(target, target);
  }

  invertedLambda(): (target: object, value: unknown) => boolean {
    const f = this.fn;
    return (target: object) => !f.call(target, target);
  }
}

export class InstanceExec2 implements CallTemplate {
  constructor(readonly fn: (target: object, block: (() => unknown) | null) => unknown) {}

  expand(target: object, value: unknown, block: (() => unknown) | null): unknown[] {
    return [target, this.fn, "instanceExec", target, block];
  }

  makeLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => unknown {
    const f = this.fn;
    return (target: object, _value: unknown, block?: (() => unknown) | null) => {
      if (!block) throw new ArgumentError();
      return f.call(target, target, block);
    };
  }

  invertedLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => boolean {
    const f = this.fn;
    return (target: object, _value: unknown, block?: (() => unknown) | null) => {
      if (!block) throw new ArgumentError();
      return !f.call(target, target, block);
    };
  }
}

export class ProcCall implements CallTemplate {
  readonly overrideTarget: ((...args: any[]) => unknown) | Value | null;

  constructor(target: ((...args: any[]) => unknown) | Value | null) {
    this.overrideTarget = target;
  }

  expand(target: object, value: unknown, block: (() => unknown) | null): unknown[] {
    return [this.overrideTarget ?? target, block, "call", target, value];
  }

  makeLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => unknown {
    return (target: object, value: unknown, block?: (() => unknown) | null) =>
      call(this.overrideTarget ?? target, target, value, block);
  }

  invertedLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => boolean {
    return (target: object, value: unknown, block?: (() => unknown) | null) =>
      !call(this.overrideTarget ?? target, target, value, block);
  }
}

function call(
  receiver: ((...args: any[]) => unknown) | Value | object,
  target: object,
  value: unknown,
  block?: (() => unknown) | null,
): unknown {
  return typeof receiver === "function"
    ? receiver(target, value, block)
    : (receiver as Value).call(target, value);
}

export namespace CallTemplate {
  export function build(
    filter: AnyCallback | string | symbol | CallbackObject | Value,
    callback: Callback,
  ): CallTemplate {
    if (typeof filter === "string" || typeof filter === "symbol") {
      if (typeof filter === "string" && !filter.startsWith(":")) {
        throw new ArgumentError(
          "Passing string to define a callback is not supported. See the `.set_callback` " +
            "documentation to see supported values.",
        );
      }
      return new MethodCall(typeof filter === "string" ? filter.slice(1) : filter);
    } else if (filter instanceof Value) {
      return new ProcCall(filter);
    } else if (
      typeof filter === "function" &&
      !/^class(?=[\s{/])(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)*[^(\s/]/.test(
        Function.prototype.toString.call(filter),
      ) &&
      !(
        /\{\s*\[native code\]\s*\}$/.test(Function.prototype.toString.call(filter)) &&
        Object.getOwnPropertyDescriptor(filter, "prototype")?.writable === false &&
        !Object.isFrozen(filter)
      )
    ) {
      const arity = filter.length;
      if (arity === 2) {
        return new InstanceExec2(
          filter as (target: object, block: (() => unknown) | null) => unknown,
        );
      } else if (arity === 1) {
        return new InstanceExec1(filter as (target: object) => unknown);
      } else {
        return new InstanceExec0(filter as () => unknown);
      }
    } else {
      const [head, ...rest] = callback.currentScopes();
      return new ObjectCall(
        filter,
        head + rest.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(""),
      );
    }
  }
}

export interface FilterEnvironment {
  target: object;
  halted: boolean;
  value: unknown;
  syncChain?: string;
}

export class Before {
  readonly userCallback: (target: object, value: unknown) => unknown;
  readonly userConditions: Array<(target: object, value: unknown) => boolean>;
  readonly terminator:
    | ((target: object, fn: () => unknown) => boolean | Promise<boolean>)
    | false
    | undefined;
  readonly filter: AnyCallback | string | symbol | CallbackObject;
  readonly name: string;

  constructor(
    userCallback: (target: object, value: unknown) => unknown,
    userConditions: Array<(target: object, value: unknown) => boolean>,
    chainConfig: {
      terminator?: ((target: object, fn: () => unknown) => boolean | Promise<boolean>) | false;
    },
    filter: AnyCallback | string | symbol | CallbackObject = "",
    name: string = "",
  ) {
    this.userCallback = userCallback;
    this.userConditions = userConditions;
    this.terminator = chainConfig.terminator;
    this.filter = filter;
    this.name = name;
  }

  call(env: FilterEnvironment): FilterEnvironment | Promise<FilterEnvironment> {
    const { target, value, halted, syncChain } = env;
    if (halted || !this.userConditions.every((c) => c(target, value))) return env;

    const terminatorFn = this.terminator;
    const resultLambda = () => this.userCallback(target, value);

    if (terminatorFn === false) {
      const r = resultLambda();
      if (!isThenable(r)) return env;
      if (syncChain !== undefined) {
        swallowRejection(r);
        throw new RuntimeError(
          `Async callback on sync chain "${syncChain}" — before returned a Promise`,
        );
      }
      return Promise.resolve(r).then(() => env);
    }

    if (terminatorFn) {
      let cbResult: unknown;
      const halt = terminatorFn(target, () => {
        cbResult = resultLambda();
        return cbResult;
      });
      if (isThenable(halt)) {
        return Promise.resolve(halt).then((h) => {
          if (h) this.halt(env);
          return env;
        });
      }
      if (isThenable(cbResult)) {
        swallowRejection(cbResult);
        if (syncChain !== undefined) {
          throw new RuntimeError(
            `Async callback on sync chain "${syncChain}" — before returned a Promise`,
          );
        }
        throw new RuntimeError(
          `Async before callback on chain "${this.name}" is unsupported with a custom terminator. ` +
            `Custom terminators cannot evaluate Promise-returning callbacks. ` +
            `Use the default terminator (halt via throw(:abort)) or make all before callbacks synchronous.`,
        );
      }
      if (halt) this.halt(env);
      return env;
    }

    let terminate = true;
    const caught = kernelCatch(":abort", () => {
      const cbResult = resultLambda();
      if (!isThenable(cbResult)) {
        terminate = false;
        return;
      }
      if (syncChain !== undefined) {
        swallowRejection(cbResult);
        throw new RuntimeError(
          `Async callback on sync chain "${syncChain}" — before returned a Promise`,
        );
      }
      return Promise.resolve(cbResult).then(() => {
        terminate = false;
      });
    });
    if (isThenable(caught)) {
      return Promise.resolve(caught).then(() => {
        if (terminate) this.halt(env);
        return env;
      });
    }
    if (terminate) this.halt(env);
    return env;
  }

  private halt(env: FilterEnvironment): void {
    env.halted = true;
    const hook = (env.target as { haltedCallbackHook?: (filter: unknown, name: string) => void })
      .haltedCallbackHook;
    if (typeof hook === "function") hook.call(env.target, this.filter, this.name);
  }

  apply(callbackSequence: CallbackSequence): CallbackSequence {
    return callbackSequence.before(this);
  }

  static build(callback: Callback, options: DefineCallbacksOptions): (target: object) => boolean {
    const terminatorFn = options.terminator;
    return (target: object) => {
      if (!Value.check(callback, target)) return true;
      const cb = callback.filter as BeforeCallback;
      if (terminatorFn === false) {
        cb.call(target, target);
        return true;
      }
      if (terminatorFn) return !terminatorFn(target, () => cb.call(target, target));
      let terminate = true;
      kernelCatch(":abort", () => {
        cb.call(target, target);
        terminate = false;
      });
      return !terminate;
    };
  }
}

export class After {
  readonly userCallback: (target: object, value: unknown) => unknown;
  readonly userConditions: Array<(target: object, value: unknown) => boolean>;
  readonly halting: boolean;

  constructor(
    userCallback: (target: object, value: unknown) => unknown,
    userConditions: Array<(target: object, value: unknown) => boolean>,
    chainConfig: { skipAfterCallbacksIfTerminated?: boolean },
  ) {
    this.userCallback = userCallback;
    this.userConditions = userConditions;
    this.halting = chainConfig.skipAfterCallbacksIfTerminated ?? false;
  }

  call(env: FilterEnvironment): FilterEnvironment | Promise<FilterEnvironment> {
    const { target, value, halted, syncChain } = env;
    if ((!halted || !this.halting) && this.userConditions.every((c) => c(target, value))) {
      const r = this.userCallback(target, value);
      if (isThenable(r)) {
        if (syncChain !== undefined) {
          swallowRejection(r);
          throw new RuntimeError(
            `Async callback on sync chain "${syncChain}" — after returned a Promise`,
          );
        }
        return Promise.resolve(r).then(() => env);
      }
    }
    return env;
  }

  apply(callbackSequence: CallbackSequence): CallbackSequence {
    return callbackSequence.after(this);
  }

  static build(callback: Callback): (target: object) => void {
    return (target: object) => {
      if (!Value.check(callback, target)) return;
      (callback.filter as AfterCallback).call(target, target);
    };
  }
}

export class Around {
  private readonly userCallback: CallTemplate;
  private readonly userConditions: Array<(target: object, value: unknown) => boolean>;

  constructor(
    userCallback: CallTemplate,
    userConditions: Array<(target: object, value: unknown) => boolean>,
  ) {
    this.userCallback = userCallback;
    this.userConditions = userConditions;
  }

  apply(callbackSequence: CallbackSequence): CallbackSequence {
    return callbackSequence.around(this.userCallback, this.userConditions);
  }

  static build(callback: Callback): (target: object, block: () => void) => void {
    return (target: object, block: () => void) => {
      if (!Value.check(callback, target)) {
        block();
        return;
      }
      (callback.filter as AroundCallback).call(target, target, block);
    };
  }
}

export class Callback {
  kind: CallbackKind;
  name: string;
  readonly filter: AnyCallback | string | symbol | CallbackObject;
  readonly options: CallbackOptions;
  readonly chainConfig: DefineCallbacksOptions;
  readonly originalObject?: CallbackObject;

  private _compiled: Before | After | Around | undefined;

  constructor(
    name: string,
    filter: AnyCallback | string | symbol | CallbackObject,
    kind: CallbackKind,
    options: CallbackOptions = {},
    chainConfig: DefineCallbacksOptions = {},
    originalObject?: CallbackObject,
  ) {
    this.name = name;
    this.filter = filter;
    this.kind = kind;
    this.options = options;
    this.chainConfig = chainConfig;
    this.originalObject = originalObject;
    void this.compiled;
  }

  static build(
    chain: { name: string; config: DefineCallbacksOptions },
    filter: AnyCallback | string | symbol | CallbackObject,
    kind: CallbackKind,
    options: CallbackOptions,
  ): Callback {
    const isObj = typeof filter === "object" && filter !== null;
    return new Callback(
      chain.name,
      filter,
      kind,
      options,
      chain.config,
      isObj ? filter : undefined,
    );
  }

  matches(kind: CallbackKind, filter?: AnyCallback | string | symbol | CallbackObject): boolean {
    if (this.kind !== kind) return false;
    if (filter === undefined) return true;
    if (typeof filter === "object" && filter !== null) return this.originalObject === filter;
    return this.filter === filter;
  }

  /** @missingRailsCall concat — PERMANENT */
  mergeConditionalOptions(
    chain: { name: string; config: DefineCallbacksOptions },
    { ifOption, unlessOption }: { ifOption?: unknown; unlessOption?: unknown },
  ): Callback {
    const existingIf = Array.isArray(this.options.if)
      ? this.options.if
      : this.options.if
        ? [this.options.if]
        : [];
    const existingUnless = Array.isArray(this.options.unless)
      ? this.options.unless
      : this.options.unless
        ? [this.options.unless]
        : [];
    return Callback.build(chain, this.filter, this.kind, {
      if: [...existingIf, ...kernelArray(unlessOption as CallbackCondition)],
      unless: [...existingUnless, ...kernelArray(ifOption as CallbackCondition)],
    });
  }

  /** @missingRailsCall matches? — PERMANENT */
  isDuplicates(other: Callback): boolean {
    if (typeof this.filter === "string") {
      return this.kind === other.kind && this.filter === other.filter;
    }
    return false;
  }

  /** @internal */
  conditionsLambdas(): Array<(target: object, value: unknown) => boolean> {
    const conditions = [
      ...kernelArray(this.options.if as CallbackCondition | CallbackCondition[]).map(
        (c) => CallTemplate.build(c, this).makeLambda() as (t: object, v: unknown) => boolean,
      ),
      ...kernelArray(this.options.unless as CallbackCondition | CallbackCondition[]).map((c) =>
        CallTemplate.build(c, this).invertedLambda(),
      ),
    ];
    return conditions;
  }

  get compiled(): Before | After | Around {
    if (this._compiled) return this._compiled;

    const userConditions = this.conditionsLambdas();

    const userCallback = CallTemplate.build(this.filter, this);

    if (this.kind === "before") {
      this._compiled = new Before(
        userCallback.makeLambda(),
        userConditions,
        this.chainConfig,
        this.filter,
        this.name,
      );
    } else if (this.kind === "after") {
      this._compiled = new After(userCallback.makeLambda(), userConditions, this.chainConfig);
    } else {
      this._compiled = new Around(userCallback, userConditions);
    }
    return this._compiled;
  }

  currentScopes(): string[] {
    const scope = this.chainConfig.scope ?? ["kind"];
    return scope.map((s) =>
      s === "kind" ? String(this.kind) : String((this as Record<string, unknown>)[s]),
    );
  }
}

export class CallbackSequence {
  readonly nested: CallbackSequence | null;
  private readonly callTemplate: CallTemplate | null;
  private readonly userConditions: Array<(target: object, value: unknown) => boolean> | null;
  private beforeList: Before[] | null = null;
  private afterList: After[] | null = null;

  constructor(
    nested: CallbackSequence | null = null,
    callTemplate: CallTemplate | null = null,
    userConditions: Array<(target: object, value: unknown) => boolean> | null = null,
  ) {
    this.nested = nested;
    this.callTemplate = callTemplate;
    this.userConditions = userConditions;
  }

  before(before: Before): this {
    (this.beforeList ??= []).unshift(before);
    return this;
  }

  after(after: After): this {
    (this.afterList ??= []).push(after);
    return this;
  }

  around(
    callTemplate: CallTemplate,
    userConditions: Array<(target: object, value: unknown) => boolean>,
  ): CallbackSequence {
    const sequence = new CallbackSequence(this, callTemplate, userConditions);
    sequence._callbackChain = this._callbackChain;
    return sequence;
  }

  isSkip(arg: FilterEnvironment): boolean {
    if (arg.halted) return true;
    if (!this.userConditions) return false;
    return !this.userConditions.every((c) => c(arg.target, arg.value));
  }

  isFinal(): boolean {
    return !this.callTemplate;
  }

  expandCallTemplate(arg: FilterEnvironment, block: (() => unknown) | null): unknown[] {
    return this.callTemplate!.expand(arg.target, arg.value, block);
  }

  invokeBefore(arg: FilterEnvironment): void | Promise<void> {
    return this._runFilters(this.beforeList, 0, arg);
  }

  invokeAfter(arg: FilterEnvironment): void | Promise<void> {
    return this._runFilters(this.afterList, 0, arg);
  }

  private _runFilters(
    list: Array<Before | After> | null,
    start: number,
    env: FilterEnvironment,
  ): void | Promise<void> {
    if (!list) return;
    for (let i = start; i < list.length; i++) {
      const r = list[i].call(env);
      if (isThenable(r)) {
        return Promise.resolve(r).then(() => this._runFilters(list, i + 1, env));
      }
    }
  }

  _callbackChain: CallbackChain | null = null;
}

export class CallbackChain {
  readonly name: string;
  readonly config: DefineCallbacksOptions;
  private chain: Callback[];
  private _allCallbacks: CallbackSequence | undefined;
  private _singleCallbacks: Map<CallbackKind, CallbackSequence> = new Map();

  constructor(name: string, config: DefineCallbacksOptions = {}) {
    this.name = name;
    this.config = { ...config };
    this.chain = [];
  }

  get entries(): Callback[] {
    return this.chain;
  }

  each(fn: (cb: Callback) => void): void {
    this.chain.forEach(fn);
  }

  index(o: Callback): number {
    return this.chain.indexOf(o);
  }

  insert(index: number, o: Callback): void {
    this._allCallbacks = undefined;
    this._singleCallbacks.clear();
    this.chain.splice(index, 0, o);
  }

  delete(o: Callback | undefined): void {
    this._allCallbacks = undefined;
    this._singleCallbacks.clear();
    const i = this.chain.indexOf(o as Callback);
    if (i !== -1) this.chain.splice(i, 1);
  }

  append(...callbacks: Callback[]): void {
    callbacks.forEach((c) => this.appendOne(c));
  }

  prepend(...callbacks: Callback[]): void {
    callbacks.forEach((c) => this.prependOne(c));
  }

  private appendOne(callback: Callback): void {
    this._allCallbacks = undefined;
    this._singleCallbacks.clear();
    this.removeDuplicates(callback);
    this.chain.push(callback);
  }

  private prependOne(callback: Callback): void {
    this._allCallbacks = undefined;
    this._singleCallbacks.clear();
    this.removeDuplicates(callback);
    this.chain.unshift(callback);
  }

  /** @missingRailsCall delete_if — PERMANENT */
  private removeDuplicates(callback: Callback): void {
    this._allCallbacks = undefined;
    this._singleCallbacks.clear();
    this.chain = this.chain.filter((c) => !callback.isDuplicates(c));
  }

  remove(kind: CallbackKind, filter?: AnyCallback | string | symbol | CallbackObject): void {
    this._allCallbacks = undefined;
    this._singleCallbacks.clear();
    this.chain = this.chain.filter((cb) => !cb.matches(kind, filter));
  }

  clear(): this {
    this._allCallbacks = undefined;
    this._singleCallbacks.clear();
    this.chain = [];
    return this;
  }

  dup(): CallbackChain {
    const copy = new CallbackChain(this.name, this.config);
    copy.chain = [...this.chain];
    return copy;
  }

  compile(type?: CallbackKind): CallbackSequence {
    if (type == null) {
      if (this._allCallbacks) return this._allCallbacks;
      const finalSequence = new CallbackSequence();
      let callbackSequence = finalSequence;
      for (let i = this.chain.length - 1; i >= 0; i--) {
        callbackSequence = this.chain[i].compiled.apply(callbackSequence);
      }
      callbackSequence._callbackChain = this;
      this._allCallbacks = callbackSequence;
      return callbackSequence;
    }

    const memo = this._singleCallbacks.get(type);
    if (memo) return memo;
    const finalSequence = new CallbackSequence();
    let callbackSequence = finalSequence;
    for (let i = this.chain.length - 1; i >= 0; i--) {
      const callback = this.chain[i];
      if (type === callback.kind) callbackSequence = callback.compiled.apply(callbackSequence);
    }
    callbackSequence._callbackChain = this;
    this._singleCallbacks.set(type, callbackSequence);
    return callbackSequence;
  }

  get isEmpty(): boolean {
    return this.chain.length === 0;
  }
}

const CALLBACK_FILTER_TYPES: CallbackKind[] = ["before", "after", "around"];

export function normalizeCallbackParams(
  filters: Array<CallbackKind | AnyCallback | string | symbol | Record<string, unknown>>,
  block: AnyCallback | null,
): [CallbackKind, Array<AnyCallback | string | symbol>, Record<string, unknown>] {
  const rest = [...filters];
  let type: CallbackKind = "before";
  if (rest.length > 0 && CALLBACK_FILTER_TYPES.includes(rest[0] as CallbackKind)) {
    type = rest.shift() as CallbackKind;
  }
  let options: Record<string, unknown> = {};
  if (rest.length > 0 && isCallbackOptions(rest[rest.length - 1])) {
    options = rest.pop() as unknown as Record<string, unknown>;
  }
  if (block) rest.unshift(block);
  return [type, rest as Array<AnyCallback | string | symbol>, { ...options }];
}

function isCallbackOptions(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const _ct = { MethodCall, ObjectCall, InstanceExec0, InstanceExec1, InstanceExec2, ProcCall };
export namespace CallTemplate {
  export const MethodCall = _ct.MethodCall;
  export const ObjectCall = _ct.ObjectCall;
  export const InstanceExec0 = _ct.InstanceExec0;
  export const InstanceExec1 = _ct.InstanceExec1;
  export const InstanceExec2 = _ct.InstanceExec2;
  export const ProcCall = _ct.ProcCall;
}

const _cond = { Value };
export namespace Conditionals {
  export const Value = _cond.Value;
}

const _filt = { Before, After, Around };
export namespace Filters {
  export const Before = _filt.Before;
  export const After = _filt.After;
  export const Around = _filt.Around;
}

export interface ClassMethods<T extends object = object> {
  defineCallbacks(name: string, options?: DefineCallbacksOptions<T>): void;
  beforeCallback(
    name: string,
    callback: BeforeCallback<T> | CallbackObject,
    options?: CallbackOptions<T>,
  ): void;
  afterCallback(
    name: string,
    callback: AfterCallback<T> | CallbackObject,
    options?: CallbackOptions<T>,
  ): void;
  aroundCallback(
    name: string,
    callback: AroundCallback<T> | CallbackObject,
    options?: CallbackOptions<T>,
  ): void;
  skipCallback(name: string, ...filterList: FilterListEntry<T>[]): void;
  resetCallbacks(name: string): void;
}

interface CallbacksClass {
  prototype: object;
  __callbacks: Record<string, CallbackChain>;
  readonly descendants: CallbacksClass[];
  getCallbacks(name: string): CallbackChain;
  setCallbacks(name: string, callbacks: CallbackChain): Record<string, CallbackChain>;
  __updateCallbacks(
    name: string,
    block: (target: CallbacksClass, chain: CallbackChain) => void,
  ): void;
}

export type FilterListEntry<T extends object = object> =
  | AnyCallback<T>
  | CallbackObject
  | string
  | CallbackOptions<T>;

interface InvokeSequenceState {
  current: CallbackSequence;
  skipped: CallbackSequence[] | null;
  step: "before" | "yield" | "after" | "skipped";
}

interface ProceedTracker {
  pending: Promise<unknown> | undefined;
  observed: boolean;
}

function assignYield(env: FilterEnvironment, y: unknown): void | Promise<void> {
  if (!isThenable(y)) {
    env.value = y;
    return;
  }
  if (env.syncChain !== undefined) {
    swallowRejection(y);
    throw new RuntimeError(
      `Async callback on sync chain "${env.syncChain}" — block returned a Promise`,
    );
  }
  return Promise.resolve(y).then((v) => {
    env.value = v;
  });
}

function observeProceed(
  tracker: ProceedTracker,
  r: PromiseLike<unknown>,
  env: FilterEnvironment,
): unknown {
  tracker.pending = Promise.resolve(r);
  const observed = tracker.pending.then(() => env.value);
  observed.catch(() => {});
  return {
    then(onFulfilled?: any, onRejected?: any) {
      if (typeof onRejected === "function") {
        tracker.observed = true;
        return observed.then(onFulfilled, onRejected);
      }
      const p = observed.then(onFulfilled);
      p.catch(() => {});
      return p;
    },
    catch(onRejected?: any) {
      if (typeof onRejected === "function") {
        tracker.observed = true;
        return observed.catch(onRejected);
      }
      const p = observed.catch(onRejected);
      p.catch(() => {});
      return p;
    },
    finally(onFinally?: any) {
      const p = observed.finally(onFinally);
      p.catch(() => {});
      return p;
    },
  };
}

export const ClassMethods = {
  __updateCallbacks(
    this: CallbacksClass,
    name: string,
    block: (target: CallbacksClass, chain: CallbackChain) => void,
  ): void {
    const targets = this.descendants;
    targets.unshift(this);
    targets.reverse().forEach((target) => {
      const chain = target.getCallbacks(name);
      block(target, chain.dup());
    });
  },

  setCallback(this: CallbacksClass, name: string, ...filterList: FilterListEntry<any>[]): void {
    const block = rbBlockGivenP(filterList[filterList.length - 1])
      ? (filterList.pop() as AnyCallback)
      : null;
    const [type, filters, options] = normalizeCallbackParams(
      filterList as Parameters<typeof normalizeCallbackParams>[0],
      block,
    );

    const selfChain = this.getCallbacks(name);
    const mapped = filters.map((filter) =>
      Callback.build(
        selfChain,
        filter as AnyCallback | CallbackObject,
        type,
        options as CallbackOptions,
      ),
    );

    this.__updateCallbacks(name, (target, chain) => {
      if (options.prepend) {
        chain.prepend(...mapped);
      } else {
        chain.append(...mapped);
      }
      target.setCallbacks(name, chain);
    });
  },

  skipCallback(this: CallbacksClass, name: string, ...filterList: FilterListEntry<any>[]): void {
    const block = rbBlockGivenP(filterList[filterList.length - 1])
      ? (filterList.pop() as AnyCallback)
      : null;
    const [type, filters, options] = normalizeCallbackParams(
      filterList as Parameters<typeof normalizeCallbackParams>[0],
      block,
    );

    if (!("raise" in options)) options.raise = true;

    this.__updateCallbacks(name, (target, chain) => {
      filters.forEach((filter) => {
        const callback = chain.entries.find((c) =>
          c.matches(type, filter as AnyCallback | CallbackObject),
        );

        if (!callback && options.raise) {
          throw new ArgumentError(
            `${type.charAt(0).toUpperCase() + type.slice(1)} ${name} callback ${String(filter)} has not been defined`,
          );
        }

        if (callback && ("if" in options || "unless" in options)) {
          const newCallback = callback.mergeConditionalOptions(chain, {
            ifOption: options.if,
            unlessOption: options.unless,
          });
          chain.insert(chain.index(callback), newCallback);
        }

        chain.delete(callback);
      });
      target.setCallbacks(name, chain);
    });
  },

  resetCallbacks(this: CallbacksClass, name: string): void {
    const callbacks = this.getCallbacks(name);

    this.descendants.forEach((target) => {
      const chain = target.getCallbacks(name).dup();
      callbacks.each((c) => chain.delete(c));
      target.setCallbacks(name, chain);
    });

    this.setCallbacks(name, callbacks.dup().clear());
  },

  defineCallbacks(
    this: CallbacksClass,
    ...names: Array<string | DefineCallbacksOptions<any>>
  ): void {
    const options = extractOptionsBang(names) as DefineCallbacksOptions;

    (names as string[]).forEach((name) => {
      [this, ...this.descendants].forEach((target) => {
        target.setCallbacks(name, new CallbackChain(name, options));
      });

      Object.defineProperty(this.prototype, `_run${camelize(name)}Callbacks`, {
        value(this: { runCallbacks: typeof runCallbacks }, block?: () => unknown) {
          return this.runCallbacks(name, block);
        },
        writable: true,
        configurable: true,
      });

      Object.defineProperty(this, `_${camelize(name, false)}Callbacks`, {
        get(this: CallbacksClass) {
          return this.getCallbacks(name);
        },
        set(this: CallbacksClass, value: CallbackChain) {
          this.setCallbacks(name, value);
        },
        configurable: true,
      });

      Object.defineProperty(this.prototype, `_${camelize(name, false)}Callbacks`, {
        get(this: { __callbacks: Record<string, CallbackChain> }) {
          return this.__callbacks[name];
        },
        configurable: true,
      });
    });
  },

  /** @internal */
  getCallbacks(this: CallbacksClass, name: string): CallbackChain {
    return this.__callbacks[name];
  },

  /** @internal */
  setCallbacks(
    this: CallbacksClass,
    name: string,
    callbacks: CallbackChain,
  ): Record<string, CallbackChain> {
    if (!Object.prototype.hasOwnProperty.call(this, "__class_attr___callbacks")) {
      this.__callbacks = { ...this.__callbacks };
      if (!rbModSingletonP(this)) {
        let klass = this as unknown as AnyClass;
        for (let superclass; (superclass = rbClassSuperclass(klass)); klass = superclass) {
          DescendantsTracker.registerSubclass(superclass, klass);
        }
      }
    }
    this.__callbacks[name] = callbacks;
    return this.__callbacks;
  },
};

export const Callbacks = new Module() as Module<{
  runCallbacks: typeof runCallbacks;
  haltedCallbackHook(_filter: unknown, _name: string): void;
}> & { ClassMethods: typeof ClassMethods };
extend(Callbacks, Concern);

Concern.included.call(Callbacks, null, function (this: AnyClass) {
  extend(this as never, DescendantsTracker);
  classAttribute.call(this, "__callbacks", {
    instanceWriter: false,
    instancePredicate: false,
    default: {},
  });
});

Callbacks.ClassMethods = ClassMethods;

Callbacks.moduleEval((mod) => {
  mod.runCallbacks = runCallbacks;

  mod.haltedCallbackHook = function (_filter: unknown, _name: string): void {};
});

function runCallbacks(
  this: object,
  kind: string,
  block?: () => unknown,
  opts?: RunCallbacksOptions,
  type?: CallbackKind,
): unknown {
  const callbacks = (this as { __callbacks: Record<string, CallbackChain> }).__callbacks[kind];

  if (callbacks.isEmpty) {
    const r = block?.();
    if (!isThenable(r)) return r;
    if (opts?.strict === "sync") {
      swallowRejection(r);
      throw new RuntimeError("Async block on chain with no callbacks");
    }
    return r;
  }
  const env: FilterEnvironment = {
    target: this,
    halted: false,
    value: undefined,
    syncChain: opts?.strict === "sync" ? callbacks.name : undefined,
  };

  let nextSequence = callbacks.compile(type);
  let resume: InvokeSequenceState | null = null;
  let tracker: ProceedTracker | null = null;

  const invokeSequence = (): unknown => {
    const proceed = resume ? null : tracker;
    let current = resume?.current ?? nextSequence;
    let skipped = resume?.skipped ?? null;
    let step = resume?.step ?? "before";
    resume = null;
    const suspend = (r: PromiseLike<unknown>, at: InvokeSequenceState["step"]) =>
      Promise.resolve(r).then(() => {
        resume = { current, skipped, step: at };
        return invokeSequence();
      });

    let result: unknown;
    sequence: while (true) {
      if (step === "before") {
        current = nextSequence;
        const beforeDone = current.invokeBefore(env);
        step = "yield";
        if (isThenable(beforeDone)) {
          result = suspend(beforeDone, "yield");
          break sequence;
        }
      }
      if (step === "yield") {
        step = "after";
        if (current.isFinal()) {
          const yielded = assignYield(env, env.halted ? false : block ? block() : true);
          if (isThenable(yielded)) {
            result = suspend(yielded, "after");
            break sequence;
          }
        } else if (current.isSkip(env)) {
          (skipped ??= []).push(current);
          nextSequence = nextSequence.nested!;
          step = "before";
          continue;
        } else {
          nextSequence = nextSequence.nested!;
          const proceeding = tracker;
          const own: ProceedTracker = (tracker = { pending: undefined, observed: false });
          let cbResult: unknown;
          try {
            const [receiver, blk, method, ...args] = current.expandCallTemplate(
              env,
              invokeSequence,
            ) as [unknown, unknown, string, ...unknown[]];
            if (method === "instanceExec") {
              cbResult = (blk as (...a: unknown[]) => unknown).apply(receiver, args);
            } else if (method === "call") {
              cbResult = (receiver as (...a: unknown[]) => unknown)(...args, blk);
            } else {
              cbResult = (receiver as Record<string, (...a: unknown[]) => unknown>)[method](
                ...args,
                blk,
              );
            }
          } catch (err) {
            if (own.pending) {
              const pending = own.pending;
              result = (async () => {
                try {
                  await pending.catch(() => {});
                } finally {
                  nextSequence = current;
                  tracker = proceeding;
                }
                throw err;
              })();
              break sequence;
            }
            nextSequence = current;
            tracker = proceeding;
            throw err;
          }
          if (isThenable(cbResult) || own.pending) {
            if (env.syncChain !== undefined) {
              nextSequence = current;
              tracker = proceeding;
              swallowRejection(cbResult);
              swallowRejection(own.pending);
              throw new RuntimeError(
                `Async callback on sync chain "${env.syncChain}" — around callback or block returned a Promise`,
              );
            }
            result = (async () => {
              try {
                try {
                  await cbResult;
                } catch (err) {
                  if (own.pending) await own.pending.catch(() => {});
                  throw err;
                }
                if (own.pending) {
                  if (own.observed) await own.pending.catch(() => {});
                  else await own.pending;
                }
              } finally {
                nextSequence = current;
                tracker = proceeding;
              }
              resume = { current, skipped, step: "after" };
              return invokeSequence();
            })();
            break sequence;
          }
          nextSequence = current;
          tracker = proceeding;
        }
      }
      if (step === "after") {
        const afterDone = current.invokeAfter(env);
        if (isThenable(afterDone)) {
          result = suspend(afterDone, "skipped");
          break sequence;
        }
      }
      while (skipped && skipped.length > 0) {
        const afterDone = skipped.pop()!.invokeAfter(env);
        if (isThenable(afterDone)) {
          result = suspend(afterDone, "skipped");
          break sequence;
        }
      }
      result = env.value;
      break sequence;
    }
    return proceed && isThenable(result) ? observeProceed(proceed, result, env) : result;
  };

  if (nextSequence.isFinal()) {
    const beforeDone = nextSequence.invokeBefore(env);
    if (isThenable(beforeDone)) {
      return Promise.resolve(beforeDone).then(() => {
        resume = { current: nextSequence, skipped: null, step: "yield" };
        return invokeSequence();
      });
    }
    const yielded = assignYield(env, env.halted ? false : block ? block() : true);
    if (isThenable(yielded)) {
      return yielded.then(() => {
        resume = { current: nextSequence, skipped: null, step: "after" };
        return invokeSequence();
      });
    }
    const afterDone = nextSequence.invokeAfter(env);
    if (isThenable(afterDone)) return Promise.resolve(afterDone).then(() => env.value);
    return env.value;
  } else {
    return invokeSequence();
  }
}
