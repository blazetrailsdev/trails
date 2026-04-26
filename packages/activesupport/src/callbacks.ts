type AnyRecord = any;

export type CallbackKind = "before" | "after" | "around";

export type CallbackCondition = (target: AnyRecord) => boolean;

export interface CallbackOptions {
  if?: CallbackCondition | CallbackCondition[];
  unless?: CallbackCondition | CallbackCondition[];
  prepend?: boolean;
}

export interface DefineCallbacksOptions {
  /**
   * Mirrors Rails' :terminator option. Pass a function `(target, fn) => boolean` (returns true
   * to halt) or `false` to disable halting entirely. Defaults to halting when a before callback
   * returns `false`.
   */
  terminator?: ((target: AnyRecord, fn: () => unknown) => boolean) | false;
  skipAfterCallbacksIfTerminated?: boolean;
  scope?: string[];
}

export type BeforeCallback = (target: AnyRecord) => AnyRecord;
export type AfterCallback = (target: AnyRecord) => void;
export type AroundCallback = (target: AnyRecord, next: () => void) => void;
export type AnyCallback = BeforeCallback | AfterCallback | AroundCallback;

// ---------------------------------------------------------------------------
// Conditionals
// ---------------------------------------------------------------------------

/** Mirrors: ActiveSupport::Callbacks::Conditionals::Value */
export class Value {
  private readonly block: (value: AnyRecord) => unknown;

  constructor(block: (value: AnyRecord) => unknown) {
    this.block = block;
  }

  call(_target: AnyRecord, value: AnyRecord): unknown {
    return this.block(value);
  }

  static check(options: CallbackOptions, target: AnyRecord): boolean {
    if (options.if) {
      const conditions = Array.isArray(options.if) ? options.if : [options.if];
      if (!conditions.every((cond) => cond(target))) return false;
    }
    if (options.unless) {
      const conditions = Array.isArray(options.unless) ? options.unless : [options.unless];
      if (conditions.some((cond) => cond(target))) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// CallTemplate — protocol for wrapping callables
// ---------------------------------------------------------------------------

/** Mirrors: ActiveSupport::Callbacks::CallTemplate */
export interface CallTemplate {
  expand(target: AnyRecord, value: AnyRecord, block: (() => unknown) | null): unknown[];
  makeLambda(): (target: AnyRecord, value: AnyRecord) => unknown;
  invertedLambda(): (target: AnyRecord, value: AnyRecord) => boolean;
}

/** Mirrors: ActiveSupport::Callbacks::CallTemplate::MethodCall */
export class MethodCall implements CallTemplate {
  constructor(readonly methodName: PropertyKey) {}

  expand(target: AnyRecord, _value: AnyRecord, block: (() => unknown) | null): unknown[] {
    return [target, block, this.methodName];
  }

  makeLambda(): (target: AnyRecord, value: AnyRecord) => unknown {
    const m = this.methodName;
    return (target: AnyRecord) => target[m]?.();
  }

  invertedLambda(): (target: AnyRecord, value: AnyRecord) => boolean {
    const m = this.methodName;
    return (target: AnyRecord) => !target[m]?.();
  }

  make(target: AnyRecord, _value: AnyRecord): AnyRecord {
    return target[this.methodName]?.call(target);
  }
}

/** Mirrors: ActiveSupport::Callbacks::CallTemplate::ObjectCall */
export class ObjectCall implements CallTemplate {
  constructor(
    readonly target: AnyRecord,
    readonly methodName: string,
  ) {}

  expand(target: AnyRecord, _value: AnyRecord, block: (() => unknown) | null): unknown[] {
    return [this.target ?? target, block, this.methodName, target];
  }

  makeLambda(): (target: AnyRecord, value: AnyRecord) => unknown {
    const ot = this.target;
    const m = this.methodName;
    return (target: AnyRecord) => (ot ?? target)[m]?.(target);
  }

  invertedLambda(): (target: AnyRecord, value: AnyRecord) => boolean {
    const ot = this.target;
    const m = this.methodName;
    return (target: AnyRecord) => !(ot ?? target)[m]?.(target);
  }

  make(instance: AnyRecord, _value: AnyRecord): AnyRecord {
    const t = this.target ?? instance;
    return t[this.methodName]?.call(t, instance);
  }
}

/** Mirrors: ActiveSupport::Callbacks::CallTemplate::InstanceExec0 */
export class InstanceExec0 implements CallTemplate {
  constructor(readonly fn: () => AnyRecord) {}

  expand(target: AnyRecord, _value: AnyRecord, block: (() => unknown) | null): unknown[] {
    return [target, this.fn, "instanceExec"];
  }

  makeLambda(): (target: AnyRecord, value: AnyRecord) => unknown {
    const f = this.fn;
    return (target: AnyRecord) => f.call(target);
  }

  invertedLambda(): (target: AnyRecord, value: AnyRecord) => boolean {
    const f = this.fn;
    return (target: AnyRecord) => !f.call(target);
  }

  make(target: AnyRecord, _value: AnyRecord): AnyRecord {
    return this.fn.call(target);
  }
}

/** Mirrors: ActiveSupport::Callbacks::CallTemplate::InstanceExec1 */
export class InstanceExec1 implements CallTemplate {
  constructor(readonly fn: (target: AnyRecord) => AnyRecord) {}

  expand(target: AnyRecord, _value: AnyRecord, block: (() => unknown) | null): unknown[] {
    return [target, this.fn, "instanceExec", target];
  }

  makeLambda(): (target: AnyRecord, value: AnyRecord) => unknown {
    const f = this.fn;
    return (target: AnyRecord) => f(target);
  }

  invertedLambda(): (target: AnyRecord, value: AnyRecord) => boolean {
    const f = this.fn;
    return (target: AnyRecord) => !f(target);
  }

  make(target: AnyRecord, _value: AnyRecord): AnyRecord {
    return this.fn(target);
  }
}

/** Mirrors: ActiveSupport::Callbacks::CallTemplate::InstanceExec2 */
export class InstanceExec2 implements CallTemplate {
  constructor(readonly fn: (target: AnyRecord, value: AnyRecord) => AnyRecord) {}

  expand(target: AnyRecord, value: AnyRecord, block: (() => unknown) | null): unknown[] {
    return [target, this.fn, "instanceExec", target, block];
  }

  makeLambda(): (target: AnyRecord, value: AnyRecord) => unknown {
    const f = this.fn;
    return (target: AnyRecord, value: AnyRecord) => f(target, value);
  }

  invertedLambda(): (target: AnyRecord, value: AnyRecord) => boolean {
    const f = this.fn;
    return (target: AnyRecord, value: AnyRecord) => !f(target, value);
  }

  make(target: AnyRecord, value: AnyRecord): AnyRecord {
    return this.fn(target, value);
  }
}

/** Mirrors: ActiveSupport::Callbacks::CallTemplate::ProcCall */
export class ProcCall implements CallTemplate {
  constructor(readonly fn: (...args: AnyRecord[]) => AnyRecord) {}

  expand(target: AnyRecord, value: AnyRecord, block: (() => unknown) | null): unknown[] {
    return [this.fn, block, "call", target, value];
  }

  makeLambda(): (target: AnyRecord, value: AnyRecord) => unknown {
    const f = this.fn;
    return (target: AnyRecord, value: AnyRecord) => f(target, value);
  }

  invertedLambda(): (target: AnyRecord, value: AnyRecord) => boolean {
    const f = this.fn;
    return (target: AnyRecord, value: AnyRecord) => !f(target, value);
  }

  make(target: AnyRecord, _value: AnyRecord): AnyRecord {
    return this.fn(target);
  }
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/** Environment struct threaded through the compiled filter chain. */
export interface FilterEnvironment {
  target: AnyRecord;
  halted: boolean;
  value: AnyRecord;
}

/** Mirrors: ActiveSupport::Callbacks::Filters::Before */
export class Before {
  readonly userCallback: (target: AnyRecord, value: AnyRecord) => unknown;
  readonly userConditions: Array<(target: AnyRecord, value: AnyRecord) => boolean>;
  readonly haltedLambda: (target: AnyRecord, fn: () => unknown) => boolean;
  readonly filter: AnyCallback | string | symbol;
  readonly name: string;

  constructor(
    userCallback: (target: AnyRecord, value: AnyRecord) => unknown,
    userConditions: Array<(target: AnyRecord, value: AnyRecord) => boolean>,
    chainConfig: { terminator?: ((target: AnyRecord, fn: () => unknown) => boolean) | false },
    filter: AnyCallback | string | symbol = "",
    name: string = "",
  ) {
    this.userCallback = userCallback;
    this.userConditions = userConditions;
    this.haltedLambda =
      chainConfig.terminator === false
        ? (_t: AnyRecord, fn: () => unknown) => {
            fn();
            return false;
          }
        : (chainConfig.terminator ?? ((_t: AnyRecord, fn: () => unknown) => fn() === false));
    this.filter = filter;
    this.name = name;
  }

  call(env: FilterEnvironment): FilterEnvironment {
    const { target, value, halted } = env;
    if (!halted && this.userConditions.every((c) => c(target, value))) {
      const resultLambda = () => this.userCallback(target, value);
      env.halted = this.haltedLambda(target, resultLambda);
    }
    return env;
  }

  apply(seq: CallbackSequence): CallbackSequence {
    return seq.before(this);
  }

  static build(
    callback: Callback,
    options: DefineCallbacksOptions,
  ): (target: AnyRecord) => boolean {
    const terminatorFn = options.terminator;
    return (target: AnyRecord) => {
      if (!Value.check(callback.options, target)) return true;
      const cb = callback.filter as BeforeCallback;
      if (terminatorFn === false) {
        cb(target);
        return true;
      } // run but never halt
      if (terminatorFn) return !terminatorFn(target, () => cb(target));
      return cb(target) !== false;
    };
  }
}

/** Mirrors: ActiveSupport::Callbacks::Filters::After */
export class After {
  readonly userCallback: (target: AnyRecord, value: AnyRecord) => unknown;
  readonly userConditions: Array<(target: AnyRecord, value: AnyRecord) => boolean>;
  readonly halting: boolean;

  constructor(
    userCallback: (target: AnyRecord, value: AnyRecord) => unknown,
    userConditions: Array<(target: AnyRecord, value: AnyRecord) => boolean>,
    chainConfig: { skipAfterCallbacksIfTerminated?: boolean },
  ) {
    this.userCallback = userCallback;
    this.userConditions = userConditions;
    this.halting = chainConfig.skipAfterCallbacksIfTerminated ?? false;
  }

  call(env: FilterEnvironment): FilterEnvironment {
    const { target, value, halted } = env;
    if ((!halted || !this.halting) && this.userConditions.every((c) => c(target, value))) {
      this.userCallback(target, value);
    }
    return env;
  }

  apply(seq: CallbackSequence): CallbackSequence {
    return seq.after(this);
  }

  static build(callback: Callback): (target: AnyRecord) => void {
    return (target: AnyRecord) => {
      if (!Value.check(callback.options, target)) return;
      (callback.filter as AfterCallback)(target);
    };
  }
}

/** Mirrors: ActiveSupport::Callbacks::Filters::Around */
export class Around {
  private readonly userCallback: CallTemplate;
  private readonly userConditions: Array<(target: AnyRecord, value: AnyRecord) => boolean>;

  constructor(
    userCallback: CallTemplate,
    userConditions: Array<(target: AnyRecord, value: AnyRecord) => boolean>,
  ) {
    this.userCallback = userCallback;
    this.userConditions = userConditions;
  }

  apply(seq: CallbackSequence): CallbackSequence {
    return seq.around(this.userCallback, this.userConditions);
  }

  static build(callback: Callback): (target: AnyRecord, block: () => void) => void {
    return (target: AnyRecord, block: () => void) => {
      if (!Value.check(callback.options, target)) {
        block();
        return;
      }
      (callback.filter as AroundCallback)(target, block);
    };
  }
}

// ---------------------------------------------------------------------------
// Callback
// ---------------------------------------------------------------------------

/** Mirrors: ActiveSupport::Callbacks::Callback */
export class Callback {
  kind: CallbackKind;
  name: string;
  readonly filter: AnyCallback | string | symbol;
  readonly options: CallbackOptions;
  readonly chainConfig: DefineCallbacksOptions;

  private _compiled: Before | After | Around | undefined;

  constructor(
    name: string,
    filter: AnyCallback | string | symbol,
    kind: CallbackKind,
    options: CallbackOptions = {},
    chainConfig: DefineCallbacksOptions = {},
  ) {
    this.name = name;
    this.filter = filter;
    this.kind = kind;
    this.options = options;
    this.chainConfig = chainConfig;
  }

  matches(kind: CallbackKind, filter?: AnyCallback | string | symbol): boolean {
    if (this.kind !== kind) return false;
    if (filter && this.filter !== filter) return false;
    return true;
  }

  mergeConditionalOptions(
    chain: { name: string; config: DefineCallbacksOptions },
    ifOption: CallbackCondition[],
    unlessOption: CallbackCondition[],
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
    return new Callback(
      chain.name,
      this.filter,
      this.kind,
      {
        if: [...existingIf, ...unlessOption],
        unless: [...existingUnless, ...ifOption],
      },
      chain.config,
    );
  }

  isDuplicates(other: Callback): boolean {
    if (typeof this.filter === "string") {
      return this.kind === other.kind && this.filter === other.filter;
    }
    return false;
  }

  get compiled(): Before | After | Around {
    if (this._compiled) return this._compiled;

    const userConditions: Array<(target: AnyRecord, value: AnyRecord) => boolean> = [];
    const ifConds = Array.isArray(this.options.if)
      ? this.options.if
      : this.options.if
        ? [this.options.if]
        : [];
    const unlessConds = Array.isArray(this.options.unless)
      ? this.options.unless
      : this.options.unless
        ? [this.options.unless]
        : [];
    for (const c of ifConds) userConditions.push((t) => c(t));
    for (const c of unlessConds) userConditions.push((t) => !c(t));

    const callTemplate =
      typeof this.filter === "function"
        ? new ProcCall(this.filter)
        : new MethodCall(this.filter as PropertyKey);

    if (this.kind === "before") {
      this._compiled = new Before(
        callTemplate.makeLambda(),
        userConditions,
        this.chainConfig,
        this.filter,
        this.name,
      );
    } else if (this.kind === "after") {
      this._compiled = new After(callTemplate.makeLambda(), userConditions, {
        skipAfterCallbacksIfTerminated: this.chainConfig.skipAfterCallbacksIfTerminated,
      });
    } else {
      this._compiled = new Around(callTemplate, userConditions);
    }
    return this._compiled!;
  }

  currentScopes(): string[] {
    const scope = this.chainConfig.scope ?? ["kind"];
    return scope.map((s) => (s === "kind" ? String(this.kind) : String((this as AnyRecord)[s])));
  }

  apply(target: AnyRecord, block?: () => void): boolean {
    if (!Value.check(this.options, target)) return true;

    if (this.kind === "before") {
      return (this.filter as BeforeCallback)(target) !== false;
    } else if (this.kind === "after") {
      (this.filter as AfterCallback)(target);
      return true;
    } else if (this.kind === "around") {
      if (!block) throw new Error("Around callbacks require a block/next function");
      (this.filter as AroundCallback)(target, block);
      return true;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// CallbackSequence
// ---------------------------------------------------------------------------

/**
 * Compiled, linked-list callback sequence.
 * Mirrors: ActiveSupport::Callbacks::CallbackSequence
 */
export class CallbackSequence {
  readonly nested: CallbackSequence | null;
  private readonly callTemplate: CallTemplate | null;
  private readonly userConditions: Array<(target: AnyRecord, value: AnyRecord) => boolean> | null;
  private beforeList: Before[] | null = null;
  private afterList: After[] | null = null;

  constructor(
    nested: CallbackSequence | null = null,
    callTemplate: CallTemplate | null = null,
    userConditions: Array<(target: AnyRecord, value: AnyRecord) => boolean> | null = null,
  ) {
    this.nested = nested;
    this.callTemplate = callTemplate;
    this.userConditions = userConditions;
  }

  before(b: Before): this {
    (this.beforeList ??= []).unshift(b);
    return this;
  }

  after(a: After): this {
    (this.afterList ??= []).push(a);
    return this;
  }

  around(
    callTemplate: CallTemplate,
    userConditions: Array<(target: AnyRecord, value: AnyRecord) => boolean>,
  ): CallbackSequence {
    const sequence = new CallbackSequence(this, callTemplate, userConditions);
    sequence._callbackChain = this._callbackChain;
    return sequence;
  }

  isSkip(env: FilterEnvironment): boolean {
    if (env.halted) return true;
    if (!this.userConditions) return false;
    return !this.userConditions.every((c) => c(env.target, env.value));
  }

  isFinal(): boolean {
    return !this.callTemplate;
  }

  expandCallTemplate(env: FilterEnvironment, block: (() => unknown) | null): unknown[] {
    return this.callTemplate!.expand(env.target, env.value, block);
  }

  invokeBefore(env: FilterEnvironment): void {
    this.beforeList?.forEach((b) => b.call(env));
  }

  invokeAfter(env: FilterEnvironment): void {
    this.afterList?.forEach((a) => a.call(env));
  }

  invoke(target: AnyRecord, block?: () => void): boolean {
    const callbackChain = this._callbackChain;
    if (!callbackChain) {
      block?.();
      return true;
    }
    return callbackChain._invoke(target, block);
  }

  // Back-reference set by CallbackChain.compile() for invoke() convenience
  _callbackChain: CallbackChain | null = null;
}

// ---------------------------------------------------------------------------
// CallbackChain
// ---------------------------------------------------------------------------

export class CallbackChain {
  readonly name: string;
  readonly config: DefineCallbacksOptions;
  private chain: Callback[];

  constructor(name: string, config: DefineCallbacksOptions = {}) {
    this.name = name;
    this.config = {
      // Default terminator: halt if before-callback returns false
      terminator: (_target: AnyRecord, fn: () => unknown) => fn() === false,
      ...config,
    };
    this.chain = [];
  }

  get entries(): Callback[] {
    return this.chain;
  }

  each(fn: (cb: Callback) => void): void {
    this.chain.forEach(fn);
  }

  index(cb: Callback): number {
    return this.chain.indexOf(cb);
  }

  insert(idx: number, cb: Callback): void {
    this.chain.splice(idx, 0, cb);
  }

  delete(cb: Callback): void {
    const i = this.chain.indexOf(cb);
    if (i !== -1) this.chain.splice(i, 1);
  }

  append(callback: Callback): void {
    this.chain.push(callback);
  }

  prepend(callback: Callback): void {
    this.chain.unshift(callback);
  }

  remove(kind: CallbackKind, filter?: AnyCallback | string | symbol): void {
    this.chain = this.chain.filter((cb) => !cb.matches(kind, filter));
  }

  clear(): void {
    this.chain = [];
  }

  compile(): CallbackSequence {
    const seq = new CallbackSequence();
    seq._callbackChain = this;
    return seq;
  }

  get isEmpty(): boolean {
    return this.chain.length === 0;
  }

  _invoke(target: AnyRecord, block?: () => void): boolean {
    const terminatorFn = this.config.terminator;
    const skipAfterIfTerminated = this.config.skipAfterCallbacksIfTerminated ?? false;
    const entries = this.chain;

    const befores = entries.filter((e) => e.kind === "before");
    const afters = entries.filter((e) => e.kind === "after");
    const arounds = entries.filter((e) => e.kind === "around");

    // Run before callbacks; track whether the chain was halted.
    let halted = false;
    for (const entry of befores) {
      if (!Value.check(entry.options, target)) continue;
      const cb = entry.filter as BeforeCallback;
      if (terminatorFn === false) {
        cb(target); // terminator disabled — never halt
      } else if (terminatorFn) {
        if (terminatorFn(target, () => cb(target))) {
          halted = true;
          break;
        }
      } else {
        if (cb(target) === false) {
          halted = true;
          break;
        }
      }
    }

    // Run around+block only when not halted (mirrors Rails CallbackSequence#skip?).
    if (!halted) {
      let core = () => {
        block?.();
      };
      for (let i = arounds.length - 1; i >= 0; i--) {
        const entry = arounds[i];
        const inner = core;
        if (!Value.check(entry.options, target)) continue;
        core = () => {
          (entry.filter as AroundCallback)(target, inner);
        };
      }
      core();
    }

    // After callbacks run even when halted unless skipAfterCallbacksIfTerminated is true.
    // Mirrors: Filters::After#call — `(!halted || !@halting)`
    if (!halted || !skipAfterIfTerminated) {
      for (let i = afters.length - 1; i >= 0; i--) {
        const entry = afters[i];
        if (!Value.check(entry.options, target)) continue;
        (entry.filter as AfterCallback)(target);
      }
    }

    return !halted;
  }
}

// ---------------------------------------------------------------------------
// ClassMethods
// ---------------------------------------------------------------------------

const CALLBACK_FILTER_TYPES: CallbackKind[] = ["before", "after", "around"];

/**
 * Mirrors: ActiveSupport::Callbacks::ClassMethods#normalize_callback_params
 */
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
  if (
    rest.length > 0 &&
    typeof rest[rest.length - 1] === "object" &&
    rest[rest.length - 1] !== null &&
    !("call" in (rest[rest.length - 1] as object))
  ) {
    options = rest.pop() as unknown as Record<string, unknown>;
  }
  if (block) rest.unshift(block);
  return [type, rest as Array<AnyCallback | string | symbol>, options];
}

/**
 * Mirrors: ActiveSupport::Callbacks::ClassMethods#__update_callbacks
 */
export function __updateCallbacks(
  name: string,
  targets: Array<{
    getCallbacks(name: string): CallbackChain;
    setCallbacks(name: string, chain: CallbackChain): void;
  }>,
  fn: (target: AnyRecord, chain: CallbackChain) => void,
): void {
  [...targets].reverse().forEach((target) => {
    const chain = target.getCallbacks(name);
    const dup = new CallbackChain(chain.name, chain.config);
    chain.entries.forEach((e) =>
      dup.append(new Callback(e.name, e.filter, e.kind, { ...e.options }, dup.config)),
    );
    fn(target, dup);
    target.setCallbacks(name, dup);
  });
}

// ---------------------------------------------------------------------------
// Namespaces (mirrors Rails module nesting)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Runtime API (unchanged from original)
// ---------------------------------------------------------------------------

export interface ClassMethods {
  defineCallbacks(name: string, options?: DefineCallbacksOptions): void;
  beforeCallback(name: string, callback: BeforeCallback, options?: CallbackOptions): void;
  afterCallback(name: string, callback: AfterCallback, options?: CallbackOptions): void;
  aroundCallback(name: string, callback: AroundCallback, options?: CallbackOptions): void;
  skipCallback(name: string, kind: CallbackKind, callback?: AnyCallback): void;
  resetCallbacks(name: string): void;
}

const CALLBACKS = Symbol("callbacks");

function getCallbackChains(target: AnyRecord): Map<string, CallbackChain> {
  if (!Object.prototype.hasOwnProperty.call(target, CALLBACKS)) {
    const parent: Map<string, CallbackChain> | undefined = target[CALLBACKS];
    const own = new Map<string, CallbackChain>();
    if (parent) {
      for (const [name, chain] of parent) {
        const newChain = new CallbackChain(chain.name, chain.config);
        for (const entry of chain.entries) {
          newChain.append(
            new Callback(entry.name, entry.filter, entry.kind, entry.options, newChain.config),
          );
        }
        own.set(name, newChain);
      }
    }
    target[CALLBACKS] = own;
  }
  return target[CALLBACKS];
}

export namespace Callbacks {
  export function defineCallbacks(
    target: AnyRecord,
    name: string,
    options: DefineCallbacksOptions = {},
  ): void {
    const chains = getCallbackChains(target);
    if (!chains.has(name)) {
      chains.set(name, new CallbackChain(name, options));
    }
  }

  export function setCallback(
    target: AnyRecord,
    name: string,
    kind: CallbackKind,
    callback: AnyCallback,
    options: CallbackOptions = {},
  ): void {
    const chains = getCallbackChains(target);
    const chain = chains.get(name);
    if (!chain) {
      throw new Error(`No callback chain "${name}" defined. Call defineCallbacks first.`);
    }
    const entry = new Callback(name, callback, kind, options, chain.config);
    if (options.prepend) {
      chain.prepend(entry);
    } else {
      chain.append(entry);
    }
  }

  export function skipCallback(
    target: AnyRecord,
    name: string,
    kind: CallbackKind,
    callback?: AnyCallback,
  ): void {
    const chains = getCallbackChains(target);
    const chain = chains.get(name);
    if (!chain) return;
    chain.remove(kind, callback);
  }

  export function resetCallbacks(target: AnyRecord, name: string): void {
    const chains = getCallbackChains(target);
    const chain = chains.get(name);
    if (chain) chain.clear();
  }

  export function runCallbacks(target: AnyRecord, name: string, block?: () => void): boolean {
    const chains = getCallbackChains(target);
    const chain = chains.get(name);
    if (!chain) {
      block?.();
      return true;
    }
    const sequence = chain.compile();
    return sequence.invoke(target, block);
  }
}

export function defineCallbacks(
  target: AnyRecord,
  name: string,
  options: DefineCallbacksOptions = {},
): void {
  Callbacks.defineCallbacks(target, name, options);
}

export function setCallback(
  target: AnyRecord,
  name: string,
  kind: CallbackKind,
  callback: AnyCallback,
  options: CallbackOptions = {},
): void {
  Callbacks.setCallback(target, name, kind, callback, options);
}

export function skipCallback(
  target: AnyRecord,
  name: string,
  kind: CallbackKind,
  callback?: AnyCallback,
): void {
  Callbacks.skipCallback(target, name, kind, callback);
}

export function resetCallbacks(target: AnyRecord, name: string): void {
  Callbacks.resetCallbacks(target, name);
}

export function runCallbacks(target: AnyRecord, name: string, block?: () => void): boolean {
  return Callbacks.runCallbacks(target, name, block);
}

export function CallbacksMixin<TBase extends new (...args: AnyRecord[]) => object>(Base?: TBase) {
  const ActualBase = (Base ?? class {}) as TBase;

  class WithCallbacks extends ActualBase {
    static defineCallbacks(name: string, options: DefineCallbacksOptions = {}): void {
      defineCallbacks(this.prototype, name, options);
    }

    static beforeCallback(
      name: string,
      callback: BeforeCallback,
      options: CallbackOptions = {},
    ): void {
      setCallback(this.prototype, name, "before", callback, options);
    }

    static afterCallback(
      name: string,
      callback: AfterCallback,
      options: CallbackOptions = {},
    ): void {
      setCallback(this.prototype, name, "after", callback, options);
    }

    static aroundCallback(
      name: string,
      callback: AroundCallback,
      options: CallbackOptions = {},
    ): void {
      setCallback(this.prototype, name, "around", callback, options);
    }

    static skipCallback(name: string, kind: CallbackKind, callback?: AnyCallback): void {
      skipCallback(this.prototype, name, kind, callback);
    }

    static resetCallbacks(name: string): void {
      resetCallbacks(this.prototype, name);
    }

    runCallbacks(name: string, block?: () => void): boolean {
      return runCallbacks(this, name, block);
    }
  }

  return WithCallbacks;
}
