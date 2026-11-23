import {
  aryDeleteIf,
  extend,
  kernelCatch,
  NoMethodError,
  rbBlockGivenP,
  rbClassSuperclass,
  rbModSingletonP,
  RuntimeError,
  Thread,
  Struct,
  rbClearMethodCache,
  capitalize,
} from "@blazetrails/ruby-compat";

import { kernelArray } from "./array-utils.js";
import { classAttribute } from "./class-attribute.js";
import { Concern } from "./concern.js";
import { ArgumentError } from "./hash-utils.js";
import { extractOptionsBang } from "./core-ext/array/extract-options.js";
import { DescendantsTracker, type AnyClass } from "./descendants-tracker.js";
import { camelize } from "./inflector.js";
import { isBlank, squish } from "./string-utils.js";

export type CallbackKind = "before" | "after" | "around";

export type CallbackCondition<T extends object = object> =
  | ((target: T, value?: unknown) => boolean | PromiseLike<boolean>)
  | Value
  | string;

export interface CallbackOptions<T extends object = object> {
  if?: CallbackCondition<T> | CallbackCondition<T>[];
  unless?: CallbackCondition<T> | CallbackCondition<T>[];
  prepend?: boolean;
  raise?: boolean;
}

export interface DefineCallbacksOptions<T extends object = object> {
  terminator?: (target: T, fn: () => unknown) => boolean | Promise<boolean>;
  skipAfterCallbacksIfTerminated?: boolean;
  scope?: string[];
  strict?: "sync";
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
  strict?: "sync" | false;
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    v !== null &&
    (typeof v === "object" || typeof v === "function") &&
    typeof (v as { then?: unknown }).then === "function"
  );
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
    return callback.conditionsLambdas().every((cond) => {
      const r: unknown = cond(target, value);
      return r != null && r !== false;
    });
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

  makeLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => unknown {
    return (target: object, _value: unknown, block?: (() => unknown) | null) => {
      const method = (target as Record<PropertyKey, unknown>)[this.methodName];
      if (typeof method !== "function") {
        /** @inventedArm if — PERMANENT */
        if (this.methodName in target) return method;
        throw new NoMethodError(
          `undefined method '${String(this.methodName)}' for an instance of ${target.constructor.name}`,
        );
      }
      return (method as (this: object, block?: (() => unknown) | null) => unknown).call(
        target,
        block,
      );
    };
  }

  invertedLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => boolean {
    return (target: object, _value: unknown, block?: (() => unknown) | null) => {
      const method = (target as Record<PropertyKey, unknown>)[this.methodName];
      if (typeof method !== "function") {
        /** @inventedArm if — PERMANENT */
        if (this.methodName in target) return !method;
        throw new NoMethodError(
          `undefined method '${String(this.methodName)}' for an instance of ${target.constructor.name}`,
        );
      }
      return !(method as (this: object, block?: (() => unknown) | null) => unknown).call(
        target,
        block,
      );
    };
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

  makeLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => unknown {
    return (target: object, _value: unknown, block?: (() => unknown) | null) => {
      const receiver = (this.target ?? target) as Record<string, unknown>;
      const method = receiver[this.methodName];
      if (typeof method !== "function") {
        throw new NoMethodError(
          `undefined method '${this.methodName}' for an instance of ${receiver.constructor.name}`,
        );
      }
      return (
        method as (this: unknown, arg: object, block?: (() => unknown) | null) => unknown
      ).call(receiver, target, block);
    };
  }

  invertedLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => boolean {
    return (target: object, _value: unknown, block?: (() => unknown) | null) => {
      const receiver = (this.target ?? target) as Record<string, unknown>;
      const method = receiver[this.methodName];
      if (typeof method !== "function") {
        throw new NoMethodError(
          `undefined method '${this.methodName}' for an instance of ${receiver.constructor.name}`,
        );
      }
      return !(
        method as (this: unknown, arg: object, block?: (() => unknown) | null) => unknown
      ).call(receiver, target, block);
    };
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
  /** @internal */
  private readonly overrideBlock:
    | ((target: object, block: (() => unknown) | null) => unknown)
    | null;

  constructor(block: ((target: object, block: (() => unknown) | null) => unknown) | null) {
    this.overrideBlock = block;
  }

  expand(target: object, value: unknown, block: (() => unknown) | null): unknown[] {
    if (!block) throw new ArgumentError();
    return [target, this.overrideBlock ?? block, "instanceExec", target, block];
  }

  makeLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => unknown {
    return (target: object, _value: unknown, block?: (() => unknown) | null) => {
      if (!block) throw new ArgumentError();
      return this.overrideBlock!.call(target, target, block);
    };
  }

  invertedLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => boolean {
    return (target: object, _value: unknown, block?: (() => unknown) | null) => {
      if (!block) throw new ArgumentError();
      return !this.overrideBlock!.call(target, target, block);
    };
  }
}

export class ProcCall implements CallTemplate {
  readonly overrideTarget:
    | ((target: object, value: unknown, block?: (() => unknown) | null) => unknown)
    | Value
    | null;

  constructor(
    target:
      | ((target: object, value: unknown, block?: (() => unknown) | null) => unknown)
      | Value
      | null,
  ) {
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
  receiver:
    | ((target: object, value: unknown, block?: (() => unknown) | null) => unknown)
    | Value
    | object,
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
    if (typeof filter === "symbol" || (typeof filter === "string" && filter.startsWith(":"))) {
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
        filter as object,
        head + rest.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(""),
      );
    }
  }
}

export class Environment extends Struct.new("target", "halted", "value") {
  declare target: object;
  declare halted: boolean;
  declare value: unknown;
  /** @noRailsEquivalent PERMANENT */
  declare syncChain?: string;
}

export class Before {
  readonly userCallback: (target: object, value: unknown) => unknown;
  readonly userConditions: Array<(target: object, value: unknown) => boolean>;
  readonly haltedLambda:
    | ((target: object, fn: () => unknown) => boolean | Promise<boolean>)
    | undefined;
  readonly filter: AnyCallback | string | symbol | CallbackObject;
  readonly name: string;

  constructor(
    userCallback: (target: object, value: unknown) => unknown,
    userConditions: Array<(target: object, value: unknown) => boolean>,
    chainConfig: {
      terminator?: (target: object, fn: () => unknown) => boolean | Promise<boolean>;
    },
    filter: AnyCallback | string | symbol | CallbackObject = "",
    name: string = "",
  ) {
    this.userCallback = userCallback;
    this.userConditions = userConditions;
    const haltedLambda = chainConfig.terminator;
    this.haltedLambda = haltedLambda;
    this.filter = filter;
    this.name = name;
  }

  call(env: Environment): Environment | Promise<Environment> {
    const { target, value, halted, syncChain } = env;
    let pending: PromiseLike<unknown> | null = null;
    let rest = 0;
    if (
      !halted &&
      this.userConditions.every((c, i) => {
        const r = c(target, value);
        if (!isThenable(r)) return r != null && r !== false;
        pending = r;
        rest = i + 1;
        return false;
      })
    ) {
      return this._callFilter(env);
    }
    if (pending === null) return env;
    /** @inventedArm throw — PERMANENT */
    if (syncChain !== undefined) {
      new Thread(() => pending);
      throw new RuntimeError(
        `Async callback on sync chain "${syncChain}" — before condition returned a Promise`,
      );
    }
    const awaited: PromiseLike<unknown> = pending;
    return (async () => {
      const first = await awaited;
      if (first == null || first === false) return env;
      for (const c of this.userConditions.slice(rest)) {
        const r = await c(target, value);
        if (r == null || r === false) return env;
      }
      return await this._callFilter(env);
    })();
  }

  /** @noRailsEquivalent PERMANENT */
  private _callFilter(env: Environment): Environment | Promise<Environment> {
    const { target, value, syncChain } = env;
    const haltedLambda = this.haltedLambda;
    const resultLambda = () => this.userCallback(target, value);

    let cbResult: unknown;
    const halt = haltedLambda!(target, () => {
      cbResult = resultLambda();
      return cbResult;
    });
    if (isThenable(halt)) {
      if (syncChain !== undefined) {
        new Thread(() => halt);
        throw new RuntimeError(
          `Async callback on sync chain "${syncChain}" — before returned a Promise`,
        );
      }
      return Promise.resolve(halt).then((h) => {
        if (h) this.halt(env);
        return env;
      });
    }
    if (isThenable(cbResult)) {
      new Thread(() => cbResult);
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

  private halt(env: Environment): void {
    env.halted = true;
    const hook = (env.target as { haltedCallbackHook?: (filter: unknown, name: string) => void })
      .haltedCallbackHook;
    if (typeof hook === "function") hook.call(env.target, this.filter, this.name);
  }

  apply(callbackSequence: CallbackSequence): CallbackSequence {
    return callbackSequence.before(this);
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

  call(env: Environment): Environment | Promise<Environment> {
    const { target, value, halted, syncChain } = env;
    let pending: PromiseLike<unknown> | null = null;
    let rest = 0;
    if (
      (!halted || !this.halting) &&
      this.userConditions.every((c, i) => {
        const r = c(target, value);
        if (!isThenable(r)) return r != null && r !== false;
        pending = r;
        rest = i + 1;
        return false;
      })
    ) {
      return this._callFilter(env);
    }
    if (pending === null) return env;
    /** @inventedArm throw — PERMANENT */
    if (syncChain !== undefined) {
      new Thread(() => pending);
      throw new RuntimeError(
        `Async callback on sync chain "${syncChain}" — after condition returned a Promise`,
      );
    }
    const awaited: PromiseLike<unknown> = pending;
    return (async () => {
      const first = await awaited;
      if (first == null || first === false) return env;
      for (const c of this.userConditions.slice(rest)) {
        const r = await c(target, value);
        if (r == null || r === false) return env;
      }
      return await this._callFilter(env);
    })();
  }

  /** @noRailsEquivalent PERMANENT */
  private _callFilter(env: Environment): Environment | Promise<Environment> {
    const { target, value, syncChain } = env;
    const r = this.userCallback(target, value);
    if (isThenable(r)) {
      if (syncChain !== undefined) {
        new Thread(() => r);
        throw new RuntimeError(
          `Async callback on sync chain "${syncChain}" — after returned a Promise`,
        );
      }
      return Promise.resolve(r).then(() => env);
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

  static build(callback: Callback): (target: object, block: () => void) => unknown {
    return (target: object, block: () => void) => {
      if (!Value.check(callback, target)) {
        block();
        return;
      }
      return (callback.filter as AroundCallback).call(target, target, block);
    };
  }
}

const EMPTY_ARRAY: readonly CallbackCondition[] = Object.freeze([]);

export class Callback {
  kind: CallbackKind;
  name: string;
  readonly filter: AnyCallback | string | symbol | CallbackObject;
  /** @internal */
  private readonly if: readonly CallbackCondition[];
  /** @internal */
  private readonly unless: readonly CallbackCondition[];
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
    this.if = this.checkConditionals(options.if);
    this.unless = this.checkConditionals(options.unless);
    this.chainConfig = chainConfig;
    this.originalObject = originalObject;
    void this.compiled;
  }

  /** @internal */
  private checkConditionals(
    conditionals: CallbackOptions["if"] | undefined,
  ): readonly CallbackCondition[] {
    if (isBlank(conditionals)) return EMPTY_ARRAY;

    conditionals = kernelArray(conditionals as CallbackCondition | CallbackCondition[]);
    if (conditionals.some((c) => typeof c === "string" && !c.startsWith(":"))) {
      throw new ArgumentError(
        squish(`
          Passing string to be evaluated in :if and :unless conditional
          options is not supported. Pass a symbol for an instance method,
          or a lambda, proc or block, instead.
        `),
      );
    }

    return Object.freeze(conditionals);
  }

  static build(
    chain: { name: string; config: DefineCallbacksOptions },
    filter: AnyCallback | string | symbol | CallbackObject,
    kind: CallbackKind,
    options: CallbackOptions,
  ): Callback {
    if (typeof filter === "string" && !filter.startsWith(":")) {
      throw new ArgumentError(
        squish(`
          Passing string to define a callback is not supported. See the \`.set_callback\`
          documentation to see supported values.
        `),
      );
    }

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

  mergeConditionalOptions(
    chain: { name: string; config: DefineCallbacksOptions },
    { ifOption, unlessOption }: { ifOption?: unknown; unlessOption?: unknown },
  ): Callback {
    const options = {
      if: [...this.if],
      unless: [...this.unless],
    };

    options.if.push(...kernelArray(unlessOption as CallbackCondition));
    options.unless.push(...kernelArray(ifOption as CallbackCondition));

    return Callback.build(chain, this.filter, this.kind, options);
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
      ...this.if.map(
        (c) => CallTemplate.build(c, this).makeLambda() as (t: object, v: unknown) => boolean,
      ),
      ...this.unless.map((c) => CallTemplate.build(c, this).invertedLambda()),
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

  isSkip(arg: Environment): boolean | Promise<boolean> {
    if (arg.halted) return true;
    if (!this.userConditions) return false;
    const conditions = this.userConditions;
    let pending: PromiseLike<unknown> | null = null;
    let rest = 0;
    const all = conditions.every((c, i) => {
      const r: unknown = c(arg.target, arg.value);
      if (!isThenable(r)) return r != null && r !== false;
      pending = r;
      rest = i + 1;
      return false;
    });
    if (pending === null) return !all;
    /** @inventedArm throw — PERMANENT */
    if (arg.syncChain !== undefined) {
      const thenable: PromiseLike<unknown> = pending;
      new Thread(() => thenable);
      throw new RuntimeError(
        `Async callback on sync chain "${arg.syncChain}" — around condition returned a Promise`,
      );
    }
    const awaited: PromiseLike<unknown> = pending;
    return (async () => {
      const first = await awaited;
      if (first == null || first === false) return true;
      for (const c of conditions.slice(rest)) {
        const r: unknown = await c(arg.target, arg.value);
        if (r == null || r === false) return true;
      }
      return false;
    })();
  }

  isFinal(): boolean {
    return !this.callTemplate;
  }

  expandCallTemplate(arg: Environment, block: (() => unknown) | null): unknown[] {
    return this.callTemplate!.expand(arg.target, arg.value, block);
  }

  invokeBefore(arg: Environment): void | Promise<void> {
    return this._runFilters(this.beforeList, 0, arg);
  }

  invokeAfter(arg: Environment): void | Promise<void> {
    return this._runFilters(this.afterList, 0, arg);
  }

  private _runFilters(
    list: Array<Before | After> | null,
    start: number,
    env: Environment,
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
    this.config = { scope: ["kind"], terminator: this.defaultTerminator(), ...config };
    this.chain = [];
  }

  get entries(): Callback[] {
    return this.chain;
  }

  each(fn: (cb: Callback) => void): Callback[] {
    for (const callback of this.chain) fn(callback);
    return this.chain;
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

  private removeDuplicates(callback: Callback): void {
    this._allCallbacks = undefined;
    this._singleCallbacks.clear();
    aryDeleteIf(this.chain, (c) => callback.isDuplicates(c));
  }

  remove(kind: CallbackKind, filter?: AnyCallback | string | symbol | CallbackObject): void {
    this._allCallbacks = undefined;
    this._singleCallbacks.clear();
    aryDeleteIf(this.chain, (cb) => cb.matches(kind, filter));
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
      const callbackSequence = [...this.chain]
        .reverse()
        .reduce(
          (callbackSequence, callback) => callback.compiled.apply(callbackSequence),
          finalSequence,
        );
      callbackSequence._callbackChain = this;
      this._allCallbacks = callbackSequence;
      return callbackSequence;
    }

    const memo = this._singleCallbacks.get(type);
    if (memo) return memo;
    const finalSequence = new CallbackSequence();
    const callbackSequence = [...this.chain]
      .reverse()
      .reduce(
        (callbackSequence, callback) =>
          type === callback.kind ? callback.compiled.apply(callbackSequence) : callbackSequence,
        finalSequence,
      );
    callbackSequence._callbackChain = this;
    this._singleCallbacks.set(type, callbackSequence);
    return callbackSequence;
  }

  get isEmpty(): boolean {
    return this.chain.length === 0;
  }

  /** @internal */
  private defaultTerminator(): (
    target: object,
    resultLambda: () => unknown,
  ) => boolean | Promise<boolean> {
    return (target, resultLambda) => {
      let terminate = true;
      const caught = kernelCatch(":abort", () => {
        const result = resultLambda();
        if (isThenable(result)) {
          return Promise.resolve(result).then(() => {
            terminate = false;
          });
        }
        terminate = false;
      });
      if (isThenable(caught)) return Promise.resolve(caught).then(() => terminate);
      return terminate;
    };
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
  const last = rest[rest.length - 1];
  if (rest.length > 0 && isCallbackOptions(last)) {
    rest.pop();
    options = last;
  }
  if (block) rest.unshift(block);
  return [type, rest as Array<AnyCallback | string | symbol>, { ...options }];
}

function isCallbackOptions(value: unknown): value is Record<string, unknown> {
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

const _filt = { Environment, Before, After, Around };
export namespace Filters {
  export const Environment = _filt.Environment;
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
  setCallback(name: string, ...filterList: FilterListEntry<T>[]): void;
  skipCallback(name: string, ...filterList: FilterListEntry<T>[]): void;
  resetCallbacks(name: string): void;
}

interface CallbacksClass extends AnyClass {
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
  skip?: boolean;
}

interface ProceedTracker {
  settled: Promise<PromiseSettledResult<unknown>[]>[];
  proceeded: Promise<PromiseSettledResult<unknown>[]>[];
  observed: boolean;
}

function assignYield(env: Environment, y: unknown): void | Promise<void> {
  if (!isThenable(y)) {
    env.value = y;
    return;
  }
  if (env.syncChain !== undefined) {
    new Thread(() => y);
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
  env: Environment,
): unknown {
  const pending = Promise.resolve(r);
  const proceeded = Promise.allSettled([pending]);
  tracker.proceeded.push(proceeded);
  tracker.settled.push(proceeded);
  const observed = () => pending.then(() => env.value);
  const settle = <T>(p: Promise<T>): Promise<T> => {
    tracker.settled.push(Promise.allSettled([p]));
    return p;
  };
  return Object.setPrototypeOf(
    {
      then(
        onFulfilled?: ((value: unknown) => unknown) | null,
        onRejected?: ((reason: unknown) => unknown) | null,
      ) {
        if (typeof onRejected === "function") {
          tracker.observed = true;
          return observed().then(onFulfilled, onRejected);
        }
        return settle(observed().then(onFulfilled));
      },
      catch(onRejected?: ((reason: unknown) => unknown) | null) {
        if (typeof onRejected === "function") {
          tracker.observed = true;
          return observed().catch(onRejected);
        }
        return settle(observed().catch(onRejected));
      },
      finally(onFinally?: (() => void) | null) {
        return settle(observed().finally(onFinally));
      },
    },
    Promise.prototype,
  );
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
            `${capitalize(type, [])} ${name} callback ${String(filter)} has not been defined`,
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
        value(
          this: { runCallbacks: typeof runCallbacks },
          block?: () => unknown,
          opts?: RunCallbacksOptions,
        ) {
          return this.runCallbacks(name, block, opts);
        },
        writable: true,
        configurable: true,
      });
      rbClearMethodCache();

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
      rbClearMethodCache();
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
    if (!Object.hasOwn(this, "__class_attr___callbacks")) {
      this.__callbacks = { ...this.__callbacks };
      if (!rbModSingletonP(this)) {
        let klass: AnyClass = this;
        for (let superclass; (superclass = rbClassSuperclass(klass)); klass = superclass) {
          DescendantsTracker.registerSubclass(superclass, klass);
        }
      }
    }
    this.__callbacks[name] = callbacks;
    return this.__callbacks;
  },
};

export const Callbacks = {
  runCallbacks,
  haltedCallbackHook(_filter: unknown, _name: string): void {},
} as {
  runCallbacks: typeof runCallbacks;
  haltedCallbackHook(_filter: unknown, _name: string): void;
} & { ClassMethods: typeof ClassMethods };
extend(Callbacks, Concern);

Concern.included.call(Callbacks, null, function (this: AnyClass) {
  extend(this as never, DescendantsTracker);
  classAttribute.call(this, "__callbacks", {
    instanceWriter: false,
    instancePredicate: false,
    default: {},
  });
});

Object.defineProperty(Callbacks, "ClassMethods", { value: ClassMethods });

function runCallbacks(
  this: object,
  kind: string,
  block?: () => unknown,
  opts?: RunCallbacksOptions,
  type?: CallbackKind,
): unknown {
  const callbacks = (this as { __callbacks: Record<string, CallbackChain> }).__callbacks[kind];
  const strict = opts?.strict ?? callbacks.config.strict;

  if (callbacks.isEmpty) {
    const r = block?.();
    if (!isThenable(r)) return r;
    if (strict === "sync") {
      new Thread(() => r);
      throw new RuntimeError("Async block on chain with no callbacks");
    }
    return r;
  }
  const env = new Filters.Environment(this, false, null);
  env.syncChain = strict === "sync" ? callbacks.name : undefined;

  let nextSequence = callbacks.compile(type);
  let resume: InvokeSequenceState | null = null;
  let tracker: ProceedTracker | null = null;

  const invokeSequence = (): unknown => {
    const proceed = resume ? null : tracker;
    let current = resume?.current ?? nextSequence;
    let skipped = resume?.skipped ?? null;
    let step = resume?.step ?? "before";
    let resolvedSkip: boolean | Promise<boolean> | undefined = resume?.skip;
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
        } else if (
          (resolvedSkip ?? (resolvedSkip = current.isSkip(env))) === true ||
          isThenable(resolvedSkip)
        ) {
          if (isThenable(resolvedSkip)) {
            const pendingSkip = resolvedSkip;
            result = Promise.resolve(pendingSkip).then((skip) => {
              resume = { current, skipped, step: "yield", skip };
              return invokeSequence();
            });
            break sequence;
          }
          resolvedSkip = undefined;
          (skipped ??= []).push(current);
          nextSequence = nextSequence.nested!;
          step = "before";
          continue;
        } else {
          nextSequence = nextSequence.nested!;
          const proceeding = tracker;
          const own: ProceedTracker = (tracker = { settled: [], proceeded: [], observed: false });
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
            if (own.settled.length > 0) {
              result = (async () => {
                try {
                  await Promise.all(own.settled);
                } finally {
                  nextSequence = current;
                  tracker = proceeding;
                }
                throw err;
              })();
              break sequence;
            }
            throw err;
          } finally {
            if (env.syncChain !== undefined || !(isThenable(cbResult) || own.settled.length > 0)) {
              nextSequence = current;
              tracker = proceeding;
            }
          }
          if (isThenable(cbResult) || own.settled.length > 0) {
            if (env.syncChain !== undefined) {
              if (isThenable(cbResult)) new Thread(() => cbResult);
              for (const proceeded of own.proceeded) {
                new Thread(async () => {
                  const [outcome] = await proceeded;
                  if (outcome.status === "rejected") throw outcome.reason;
                });
              }
              throw new RuntimeError(
                `Async callback on sync chain "${env.syncChain}" — around callback or block returned a Promise`,
              );
            }
            result = (async () => {
              try {
                try {
                  await cbResult;
                } catch (err) {
                  await Promise.all(own.settled);
                  throw err;
                }
                await Promise.all(own.settled);
                for (const [proceeded] of await Promise.all(own.proceeded)) {
                  if (!own.observed && proceeded.status === "rejected") throw proceeded.reason;
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
