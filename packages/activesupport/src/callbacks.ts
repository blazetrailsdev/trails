import { kernelArray } from "./array-utils.js";
import { ArgumentError } from "./hash-utils.js";

export type CallbackKind = "before" | "after" | "around";

const ABORT = Symbol("blazetrails.activesupport.callbacks.abort");

export function throwAbort(): never {
  throw ABORT;
}

export function isAbortSignal(e: unknown): boolean {
  return e === ABORT;
}

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
  terminator?: ((target: T, fn: () => unknown) => boolean) | false;
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

export type CallbackObject = { [key: string]: unknown };

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

  makeLambda(): (target: object, value: unknown) => unknown {
    const m = this.methodName;
    return (target: object) =>
      ((target as Record<PropertyKey, unknown>)[m] as (() => unknown) | undefined)?.();
  }

  invertedLambda(): (target: object, value: unknown) => boolean {
    const m = this.methodName;
    return (target: object) =>
      !((target as Record<PropertyKey, unknown>)[m] as (() => unknown) | undefined)?.();
  }

  make(target: object, _value: unknown): unknown {
    const t = target as Record<PropertyKey, unknown>;
    return (t[this.methodName] as ((this: unknown) => unknown) | undefined)?.call(target);
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

  private send(receiver: Record<string, unknown>, target: object): unknown {
    const method = receiver[this.methodName];
    if (typeof method !== "function") {
      throw new TypeError(
        `undefined method '${this.methodName}' for callback object (kind/scope mismatch)`,
      );
    }
    return (method as (this: unknown, arg: object) => unknown).call(receiver, target);
  }

  makeLambda(): (target: object, value: unknown) => unknown {
    const ot = this.target;
    return (target: object) => this.send((ot ?? target) as Record<string, unknown>, target);
  }

  invertedLambda(): (target: object, value: unknown) => boolean {
    const ot = this.target;
    return (target: object) => !this.send((ot ?? target) as Record<string, unknown>, target);
  }

  make(instance: object, _value: unknown): unknown {
    return this.send((this.target ?? instance) as Record<string, unknown>, instance);
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

  make(target: object, _value: unknown): unknown {
    return this.fn.call(target);
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

  make(target: object, _value: unknown): unknown {
    return this.fn.call(target, target);
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
      if (!block) throw new Error("InstanceExec2 callback requires a block");
      return f.call(target, target, block);
    };
  }

  invertedLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => boolean {
    const f = this.fn;
    return (target: object, _value: unknown, block?: (() => unknown) | null) => {
      if (!block) throw new Error("InstanceExec2 callback requires a block");
      return !f.call(target, target, block);
    };
  }

  make(target: object, block: (() => unknown) | null): unknown {
    if (!block) throw new Error("InstanceExec2 callback requires a block");
    return this.fn.call(target, target, block);
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
        throw new Error(`Passing string to define a callback is not supported: ${filter}`);
      }
      return new MethodCall(typeof filter === "string" ? filter.slice(1) : filter);
    } else if (filter instanceof Value) {
      return new ProcCall(filter);
    } else if (typeof filter === "function") {
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
}

export class Before {
  readonly userCallback: (target: object, value: unknown) => unknown;
  readonly userConditions: Array<(target: object, value: unknown) => boolean>;
  readonly terminator: ((target: object, fn: () => unknown) => boolean) | false | undefined;
  readonly filter: AnyCallback | string | symbol | CallbackObject;
  readonly name: string;

  constructor(
    userCallback: (target: object, value: unknown) => unknown,
    userConditions: Array<(target: object, value: unknown) => boolean>,
    chainConfig: { terminator?: ((target: object, fn: () => unknown) => boolean) | false },
    filter: AnyCallback | string | symbol | CallbackObject = "",
    name: string = "",
  ) {
    this.userCallback = userCallback;
    this.userConditions = userConditions;
    this.terminator = chainConfig.terminator;
    this.filter = filter;
    this.name = name;
  }

  call(
    env: FilterEnvironment,
    opts?: RunCallbacksOptions,
    chainName = "",
  ): FilterEnvironment | Promise<FilterEnvironment> {
    const { target, value, halted } = env;
    if (halted || !this.userConditions.every((c) => c(target, value))) return env;

    const terminatorFn = this.terminator;
    const resultLambda = () => this.userCallback(target, value);

    if (terminatorFn === false) {
      const r = resultLambda();
      if (!isThenable(r)) return env;
      if (opts?.strict === "sync") {
        swallowRejection(r);
        throw new Error(`Async callback on sync chain "${chainName}" — before returned a Promise`);
      }
      return Promise.resolve(r).then(() => env);
    }

    if (terminatorFn) {
      let cbResult: unknown;
      const halt = terminatorFn(target, () => {
        cbResult = resultLambda();
        return cbResult;
      });
      if (isThenable(cbResult)) {
        swallowRejection(cbResult);
        if (opts?.strict === "sync") {
          throw new Error(
            `Async callback on sync chain "${chainName}" — before returned a Promise`,
          );
        }
        throw new Error(
          `Async before callback on chain "${chainName}" is unsupported with a custom terminator. ` +
            `Custom terminators cannot evaluate Promise-returning callbacks. ` +
            `Use the default terminator (halt via throwAbort()) or make all before callbacks synchronous.`,
        );
      }
      if (halt) this.halt(env);
      return env;
    }

    let cbResult: unknown;
    try {
      cbResult = resultLambda();
    } catch (e) {
      if (!isAbortSignal(e)) throw e;
      this.halt(env);
      return env;
    }
    if (!isThenable(cbResult)) return env;
    if (opts?.strict === "sync") {
      swallowRejection(cbResult);
      throw new Error(`Async callback on sync chain "${chainName}" — before returned a Promise`);
    }
    return Promise.resolve(cbResult).then(
      () => env,
      (e) => {
        if (!isAbortSignal(e)) throw e;
        this.halt(env);
        return env;
      },
    );
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
      try {
        cb.call(target, target);
        return true;
      } catch (e) {
        if (isAbortSignal(e)) return false;
        throw e;
      }
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

  call(
    env: FilterEnvironment,
    opts?: RunCallbacksOptions,
    chainName = "",
  ): FilterEnvironment | Promise<FilterEnvironment> {
    const { target, value, halted } = env;
    if ((!halted || !this.halting) && this.userConditions.every((c) => c(target, value))) {
      const r = this.userCallback(target, value);
      if (isThenable(r)) {
        if (opts?.strict === "sync") {
          swallowRejection(r);
          throw new Error(`Async callback on sync chain "${chainName}" — after returned a Promise`);
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

  invokeAround(env: FilterEnvironment, next: () => unknown): unknown {
    const expanded = this.expandCallTemplate(env, next);
    const method = expanded[2];
    if (method === "instanceExec") {
      const fn = expanded[1] as (...args: unknown[]) => unknown;
      return fn.apply(expanded[0], expanded.slice(3));
    }
    if (method === "call") {
      const fn = expanded[0] as (...args: unknown[]) => unknown;
      return fn(...expanded.slice(3), expanded[1]);
    }
    const receiver = expanded[0] as Record<PropertyKey, (...args: unknown[]) => unknown>;
    return receiver[method as PropertyKey](...expanded.slice(3), expanded[1]);
  }

  invokeBefore(
    env: FilterEnvironment,
    opts?: RunCallbacksOptions,
    chainName = "",
  ): void | Promise<void> {
    return this._runFilters(this.beforeList, 0, env, opts, chainName);
  }

  invokeAfter(
    env: FilterEnvironment,
    opts?: RunCallbacksOptions,
    chainName = "",
  ): void | Promise<void> {
    return this._runFilters(this.afterList, 0, env, opts, chainName);
  }

  private _runFilters(
    list: Array<Before | After> | null,
    start: number,
    env: FilterEnvironment,
    opts: RunCallbacksOptions | undefined,
    chainName: string,
  ): void | Promise<void> {
    if (!list) return;
    for (let i = start; i < list.length; i++) {
      const r = list[i].call(env, opts, chainName);
      if (isThenable(r)) {
        return Promise.resolve(r).then(() => this._runFilters(list, i + 1, env, opts, chainName));
      }
    }
  }

  invoke(target: object, block?: () => unknown, opts?: RunCallbacksOptions): unknown {
    const chainName = this._callbackChain?.name ?? "";
    const env: FilterEnvironment = { target, halted: false, value: undefined };

    if (this.isFinal()) {
      const beforeDone = this.invokeBefore(env, opts, chainName);
      if (isThenable(beforeDone)) {
        return Promise.resolve(beforeDone).then(() =>
          this._finishFinal(env, block, opts, chainName),
        );
      }
      return this._finishFinal(env, block, opts, chainName);
    }

    return this._invokeAround(env, block, opts, chainName);
  }

  private _invokeAround(
    env: FilterEnvironment,
    block: (() => unknown) | undefined,
    opts: RunCallbacksOptions | undefined,
    chainName: string,
  ): unknown {
    const runFinal = (current: CallbackSequence): void | Promise<void> => {
      if (env.halted) {
        env.value = false;
        return current.invokeAfter(env, opts, chainName);
      }
      const y = block ? block() : true;
      if (isThenable(y)) {
        if (opts?.strict === "sync") {
          swallowRejection(y);
          throw new Error(`Async callback on sync chain "${chainName}" — block returned a Promise`);
        }
        return Promise.resolve(y).then((v) => {
          env.value = v;
          return current.invokeAfter(env, opts, chainName);
        });
      }
      env.value = y;
      return current.invokeAfter(env, opts, chainName);
    };

    const runSeq = (current: CallbackSequence): void | Promise<void> => {
      const beforeDone = current.invokeBefore(env, opts, chainName);
      if (isThenable(beforeDone)) {
        return Promise.resolve(beforeDone).then(() => afterBefore(current));
      }
      return afterBefore(current);
    };

    const afterBefore = (current: CallbackSequence): void | Promise<void> => {
      if (current.isFinal()) return runFinal(current);
      if (current.isSkip(env)) {
        const inner = runSeq(current.nested!);
        if (isThenable(inner)) {
          return Promise.resolve(inner).then(() => current.invokeAfter(env, opts, chainName));
        }
        return current.invokeAfter(env, opts, chainName);
      }
      return runAround(current);
    };

    const runAround = (current: CallbackSequence): void | Promise<void> => {
      let pendingProceed: Promise<void> | undefined;
      let proceedObserved = false;
      const next = (): unknown => {
        const r = runSeq(current.nested!);
        if (!isThenable(r)) return env.value;
        pendingProceed = Promise.resolve(r);
        const observed = pendingProceed.then(() => env.value);
        observed.catch(() => {});
        return {
          then(onFulfilled?: any, onRejected?: any) {
            if (typeof onRejected === "function") {
              proceedObserved = true;
              return observed.then(onFulfilled, onRejected);
            }
            const p = observed.then(onFulfilled);
            p.catch(() => {});
            return p;
          },
          catch(onRejected?: any) {
            if (typeof onRejected === "function") {
              proceedObserved = true;
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
        } as unknown as Promise<void>;
      };

      const afterAround = (): void | Promise<void> => current.invokeAfter(env, opts, chainName);

      let cbResult: void | Promise<void>;
      try {
        cbResult = current.invokeAround(env, next) as void | Promise<void>;
      } catch (err) {
        if (pendingProceed) {
          return (async () => {
            await pendingProceed.catch(() => {});
            throw err;
          })();
        }
        throw err;
      }
      if (isThenable(cbResult) || pendingProceed) {
        if (opts?.strict === "sync") {
          swallowRejection(cbResult);
          swallowRejection(pendingProceed);
          throw new Error(
            `Async callback on sync chain "${chainName}" — around callback or block returned a Promise`,
          );
        }
        return (async () => {
          try {
            await cbResult;
          } catch (err) {
            if (pendingProceed) await pendingProceed.catch(() => {});
            throw err;
          }
          if (pendingProceed) {
            if (proceedObserved) await pendingProceed.catch(() => {});
            else await pendingProceed;
          }
          return afterAround();
        })();
      }
      return afterAround();
    };

    const result = runSeq(this);
    if (isThenable(result)) return Promise.resolve(result).then(() => env.value);
    return env.value;
  }

  private _finishFinal(
    env: FilterEnvironment,
    block: (() => unknown) | undefined,
    opts: RunCallbacksOptions | undefined,
    chainName: string,
  ): unknown {
    if (env.halted) {
      env.value = false;
      const afterDone = this.invokeAfter(env, opts, chainName);
      if (isThenable(afterDone)) return Promise.resolve(afterDone).then(() => false);
      return false;
    }
    const y = block ? block() : true;
    if (isThenable(y)) {
      if (opts?.strict === "sync") {
        swallowRejection(y);
        throw new Error(`Async callback on sync chain "${chainName}" — block returned a Promise`);
      }
      return Promise.resolve(y).then((v) => {
        env.value = v;
        const afterDone = this.invokeAfter(env, opts, chainName);
        if (isThenable(afterDone)) return Promise.resolve(afterDone).then(() => env.value);
        return env.value;
      });
    }
    env.value = y;
    const afterDone = this.invokeAfter(env, opts, chainName);
    if (isThenable(afterDone)) return Promise.resolve(afterDone).then(() => env.value);
    return env.value;
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

  delete(o: Callback): void {
    this._allCallbacks = undefined;
    this._singleCallbacks.clear();
    const i = this.chain.indexOf(o);
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

  clear(): void {
    this._allCallbacks = undefined;
    this._singleCallbacks.clear();
    this.chain = [];
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
  if (proto !== Object.prototype && proto !== null) return false;
  return !Object.entries(value as Record<string, unknown>).some(
    ([k, v]) => typeof v === "function" && k !== "if" && k !== "unless",
  );
}

/**
 * @missingRailsCall descendants — CONVERGEABLE callbacks-update-callbacks-reads-its-own-descendants
 * @missingRailsCall prepend — CONVERGEABLE callbacks-update-callbacks-reads-its-own-descendants
 */
export function __updateCallbacks(
  name: string,
  targets: Array<{
    getCallbacks(name: string): CallbackChain;
    setCallbacks(name: string, chain: CallbackChain): void;
  }>,
  fn: (target: object, chain: CallbackChain) => void,
): void {
  [...targets].reverse().forEach((target) => {
    const chain = target.getCallbacks(name);
    const dup = new CallbackChain(chain.name, chain.config);
    chain.entries.forEach((e) =>
      dup.append(
        new Callback(e.name, e.filter, e.kind, { ...e.options }, dup.config, e.originalObject),
      ),
    );
    fn(target, dup);
    target.setCallbacks(name, dup);
  });
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

const CALLBACKS = Symbol("callbacks");

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function peekCallbackChain(target: object, name: string): CallbackChain | undefined {
  let t: object | null = target;
  while (t !== null) {
    if (Object.prototype.hasOwnProperty.call(t, CALLBACKS)) {
      return (t as Record<symbol, Map<string, CallbackChain>>)[CALLBACKS].get(name);
    }
    t = Object.getPrototypeOf(t);
  }
  return undefined;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function getCallbackChains(target: object): Map<string, CallbackChain> {
  const t = target as Record<symbol, unknown>;
  if (!Object.prototype.hasOwnProperty.call(target, CALLBACKS)) {
    const parent = t[CALLBACKS] as Map<string, CallbackChain> | undefined;
    const own = new Map<string, CallbackChain>();
    if (parent) {
      for (const [name, chain] of parent) {
        const newChain = new CallbackChain(chain.name, chain.config);
        for (const entry of chain.entries) {
          newChain.append(
            new Callback(
              entry.name,
              entry.filter,
              entry.kind,
              entry.options,
              newChain.config,
              entry.originalObject,
            ),
          );
        }
        own.set(name, newChain);
      }
    }
    t[CALLBACKS] = own;
  }
  return t[CALLBACKS] as Map<string, CallbackChain>;
}

export type FilterListEntry<T extends object = object> =
  | AnyCallback<T>
  | CallbackObject
  | string
  | CallbackOptions<T>;

export namespace Callbacks {
  export function defineCallbacks<T extends object>(
    target: T,
    name: string,
    options: DefineCallbacksOptions<T> = {},
  ): void {
    const chains = getCallbackChains(target);
    if (!chains.has(name)) {
      chains.set(name, new CallbackChain(name, options as DefineCallbacksOptions));
    }
  }

  export function setCallback<T extends object>(
    target: T,
    name: string,
    ...filterList: FilterListEntry<T>[]
  ): void {
    const [type, filters, options] = normalizeCallbackParams(
      filterList as Parameters<typeof normalizeCallbackParams>[0],
      null,
    );
    const chains = getCallbackChains(target);
    const chain = chains.get(name);
    if (!chain) {
      throw new Error(`No callback chain "${name}" defined. Call defineCallbacks first.`);
    }
    const mapped = filters.map((filter) =>
      Callback.build(
        chain,
        filter as AnyCallback | CallbackObject,
        type,
        options as CallbackOptions,
      ),
    );
    if (options.prepend) {
      chain.prepend(...mapped);
    } else {
      chain.append(...mapped);
    }
  }

  export function skipCallback<T extends object>(
    target: T,
    name: string,
    ...filterList: FilterListEntry<T>[]
  ): void {
    const [type, filters, options] = normalizeCallbackParams(
      filterList as Parameters<typeof normalizeCallbackParams>[0],
      null,
    );
    if (!("raise" in options)) options.raise = true;

    let chain = peekCallbackChain(target, name);
    if (!chain) return;
    for (const filter of filters) {
      let callback = chain.entries.find((c) =>
        c.matches(type, filter as AnyCallback | CallbackObject),
      );

      if (!callback && options.raise) {
        throw new ArgumentError(
          `${type.charAt(0).toUpperCase() + type.slice(1)} ${name} callback ${String(filter)} has not been defined`,
        );
      }
      if (!callback) continue;

      if (!Object.prototype.hasOwnProperty.call(target, CALLBACKS)) {
        chain = getCallbackChains(target).get(name)!;
        callback = chain.entries.find((c) =>
          c.matches(type, filter as AnyCallback | CallbackObject),
        )!;
      }

      if ("if" in options || "unless" in options) {
        const newCallback = callback.mergeConditionalOptions(chain, {
          ifOption: options.if,
          unlessOption: options.unless,
        });
        chain.insert(chain.index(callback), newCallback);
      }
      chain.delete(callback);
    }
  }

  export function resetCallbacks(target: object, name: string): void {
    const chains = getCallbackChains(target);
    const chain = chains.get(name);
    if (chain) chain.clear();
  }

  export function runCallbacks(
    target: object,
    name: string,
    block?: () => unknown,
    opts?: RunCallbacksOptions,
    type?: CallbackKind,
  ): unknown {
    const chain = peekCallbackChain(target, name);
    if (!chain) {
      const r = block?.();
      if (!isThenable(r)) return r;
      if (opts?.strict === "sync") {
        swallowRejection(r);
        throw new Error("Async block on chain with no callbacks");
      }
      return r;
    }
    const sequence = chain.compile(type);
    return sequence.invoke(target, block, opts);
  }

  export const ClassMethods = {
    setCallback(
      this: { prototype: object },
      name: string,
      ...filterList: FilterListEntry<any>[]
    ): void {
      Callbacks.setCallback(this.prototype, name, ...filterList);
    },

    skipCallback(
      this: { prototype: object },
      name: string,
      ...filterList: FilterListEntry<any>[]
    ): void {
      Callbacks.skipCallback(this.prototype, name, ...filterList);
    },

    resetCallbacks(this: { prototype: object }, name: string): void {
      Callbacks.resetCallbacks(this.prototype, name);
    },
  };

  export const InstanceMethods = {
    runCallbacks(
      this: object,
      name: string,
      block?: () => unknown,
      opts?: RunCallbacksOptions,
      type?: CallbackKind,
    ): unknown {
      return Callbacks.runCallbacks(this, name, block, opts, type);
    },

    haltedCallbackHook(_filter: unknown, _name: string): void {},
  };
}

export function defineCallbacks<T extends object>(
  target: T,
  name: string,
  options: DefineCallbacksOptions<T> = {},
): void {
  Callbacks.defineCallbacks(target, name, options);
}

export function setCallback<T extends object>(
  target: T,
  name: string,
  ...filterList: FilterListEntry<T>[]
): void {
  Callbacks.setCallback(target, name, ...filterList);
}

export function skipCallback<T extends object>(
  target: T,
  name: string,
  ...filterList: FilterListEntry<T>[]
): void {
  Callbacks.skipCallback(target, name, ...filterList);
}

export function resetCallbacks(target: object, name: string): void {
  Callbacks.resetCallbacks(target, name);
}

export function runCallbacks(
  target: object,
  name: string,
  block?: () => unknown,
  opts?: RunCallbacksOptions,
  type?: CallbackKind,
): unknown {
  return Callbacks.runCallbacks(target, name, block, opts, type);
}

export function CallbacksMixin<TBase extends new (...args: any[]) => object>(Base?: TBase) {
  const ActualBase = (Base ?? class {}) as TBase;

  class WithCallbacks extends ActualBase {
    static defineCallbacks<T extends object>(
      this: { prototype: T },
      name: string,
      options: DefineCallbacksOptions<T> = {},
    ): void {
      defineCallbacks(this.prototype, name, options);
    }

    static beforeCallback<T extends object>(
      this: { prototype: T },
      name: string,
      callback: BeforeCallback<T> | CallbackObject,
      options: CallbackOptions<T> = {},
    ): void {
      setCallback(this.prototype, name, "before", callback, options);
    }

    static afterCallback<T extends object>(
      this: { prototype: T },
      name: string,
      callback: AfterCallback<T> | CallbackObject,
      options: CallbackOptions<T> = {},
    ): void {
      setCallback(this.prototype, name, "after", callback, options);
    }

    static aroundCallback<T extends object>(
      this: { prototype: T },
      name: string,
      callback: AroundCallback<T> | CallbackObject,
      options: CallbackOptions<T> = {},
    ): void {
      setCallback(this.prototype, name, "around", callback, options);
    }

    static skipCallback<T extends object>(
      this: { prototype: T },
      name: string,
      ...filterList: FilterListEntry<T>[]
    ): void {
      skipCallback(this.prototype, name, ...filterList);
    }

    static resetCallbacks(name: string): void {
      resetCallbacks(this.prototype, name);
    }

    runCallbacks(
      name: string,
      block?: () => unknown,
      opts?: RunCallbacksOptions,
      type?: CallbackKind,
    ): unknown {
      return runCallbacks(this, name, block, opts, type);
    }

    /** @internal */
    haltedCallbackHook(_filter: unknown, _name: string): void {}
  }

  return WithCallbacks;
}
